// ============================================================================
// Listening Session Service v2 — unseen queue + AI prefetch
//
// Flow:
//   1. On /start: query DB for LISTENING questions user never answered
//   2. Serve from unseen queue first (instant, no AI cost)
//   3. When user reaches second-to-last unseen → fire background AI generation
//   4. When queue empty → generate synchronously (20-30s wait)
//
// backend/src/services/listening-session.service.ts
// ============================================================================

import { PrismaClient } from "@prisma/client";

// ── In-memory state per session ───────────────────────────────────────────

interface SessionState {
  unseenQueue: string[]; // question IDs not yet shown
  shownIds: Set<string>; // IDs already shown this session
  prefetchPromise: Promise<string | null> | null;
  subjectId: string;
  topicId: string;
  difficulty: number;
  userId: string;
}

const sessions = new Map<string, SessionState>();

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Initialize listening session: load unseen queue from DB.
 * Returns first question (from DB if available, or AI-generated).
 */
export async function initListeningSession(
  prisma: PrismaClient,
  params: {
    sessionId: string;
    subjectId: string;
    topicId: string;
    difficulty: number;
    userId: string;
  },
): Promise<{ questionId: string; content: any }> {
  const { sessionId, subjectId, topicId, difficulty, userId } = params;

  // 1. Find all unseen LISTENING questions for this user
  const unseenQuestions = await prisma.$queryRaw<{ id: string }[]>`
    SELECT q.id
    FROM "Question" q
    WHERE q."subjectId" = ${subjectId}
      AND q."topicId" = ${topicId}
      AND q.type = 'LISTENING'
      AND q."isActive" = true
      AND q.content->>'audioUrl' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Answer" a
        WHERE a."questionId" = q.id AND a."userId" = ${userId}
      )
    ORDER BY RANDOM()
  `;

  const unseenIds = unseenQuestions.map((q) => q.id);
  console.log(
    `🎧 Listening session ${sessionId}: ${unseenIds.length} unseen questions in DB`,
  );

  // 2. Initialize session state
  const state: SessionState = {
    unseenQueue: unseenIds,
    shownIds: new Set(),
    prefetchPromise: null,
    subjectId,
    topicId,
    difficulty,
    userId,
  };
  sessions.set(sessionId, state);

  // 3. Return first question
  if (unseenIds.length > 0) {
    const firstId = unseenIds.shift()!;
    state.shownIds.add(firstId);

    // If only 1 left after taking this one → prefetch in background
    if (unseenIds.length <= 1) {
      triggerPrefetch(prisma, sessionId, state);
    }

    const question = await fetchQuestion(prisma, firstId);
    if (!question) throw new Error("Question not found in DB");
    return { questionId: firstId, content: question.content };
  }

  // 4. No unseen questions at all → generate synchronously
  console.log(`🧠 No unseen listening questions, generating new...`);
  return await generateNewQuestion(prisma, state);
}

/**
 * Get next listening question for session.
 * Serves from unseen queue, or uses prefetched, or generates live.
 */
export async function getNextListeningQuestion(
  prisma: PrismaClient,
  params: {
    sessionId: string;
    subjectId: string;
    topicId: string;
    difficulty: number;
    userId: string;
  },
): Promise<{ questionId: string; content: any }> {
  const { sessionId } = params;
  let state = sessions.get(sessionId);

  // Session not found (e.g. server restart) — reinitialize
  if (!state) {
    return initListeningSession(prisma, params);
  }

  // 1. Try unseen queue first (instant!)
  while (state.unseenQueue.length > 0) {
    const nextId = state.unseenQueue.shift()!;

    // Skip if somehow already shown
    if (state.shownIds.has(nextId)) continue;
    state.shownIds.add(nextId);

    // Verify question still exists and has audio
    const q = await fetchQuestion(prisma, nextId);
    if (!q || !(q.content as any)?.audioUrl) continue;

    console.log(
      `🎧 Serving unseen question ${nextId} (${state.unseenQueue.length} remaining in queue)`,
    );

    // Prefetch when second-to-last
    if (state.unseenQueue.length <= 1 && !state.prefetchPromise) {
      triggerPrefetch(prisma, sessionId, state);
    }

    return { questionId: nextId, content: q.content };
  }

  // 2. Queue empty — check if prefetch completed
  if (state.prefetchPromise) {
    console.log(`⏳ Waiting for prefetched question...`);
    const prefetchedId = await state.prefetchPromise;
    state.prefetchPromise = null;

    if (prefetchedId && !state.shownIds.has(prefetchedId)) {
      state.shownIds.add(prefetchedId);
      const q = await fetchQuestion(prisma, prefetchedId);
      if (q && (q.content as any)?.audioUrl) {
        // Start another prefetch for the NEXT one
        triggerPrefetch(prisma, sessionId, state);
        return { questionId: prefetchedId, content: q.content };
      }
    }
  }

  // 3. Nothing available — generate synchronously
  console.log(`🧠 Generating listening question synchronously...`);
  const result = await generateNewQuestion(prisma, state);

  // Immediately start prefetching the next one
  triggerPrefetch(prisma, sessionId, state);

  return result;
}

/**
 * Cleanup session state.
 */
export function cleanupPrefetch(sessionId: string): void {
  sessions.delete(sessionId);
}

// ── Internal helpers ──────────────────────────────────────────────────────

async function fetchQuestion(prisma: PrismaClient, id: string) {
  return prisma.question.findUnique({
    where: { id },
    select: { id: true, content: true, difficulty: true },
  });
}

function triggerPrefetch(
  prisma: PrismaClient,
  sessionId: string,
  state: SessionState,
): void {
  if (state.prefetchPromise) return; // already prefetching

  console.log(`🔮 Prefetching next listening question in background...`);

  state.prefetchPromise = (async () => {
    try {
      const result = await generateNewQuestion(prisma, state);
      console.log(`✅ Prefetch complete: ${result.questionId}`);
      return result.questionId;
    } catch (err: any) {
      console.error(`❌ Prefetch failed: ${err.message}`);
      return null;
    }
  })();
}

async function generateNewQuestion(
  prisma: PrismaClient,
  state: SessionState,
): Promise<{ questionId: string; content: any }> {
  const { generateListeningQuestion } =
    await import("./listening-generator.js");

  // Detect language from subject
  const subject = await prisma.subject.findUnique({
    where: { id: state.subjectId },
    select: { slug: true },
  });
  const language: "en" | "de" = subject?.slug === "niemiecki" ? "de" : "en";

  // Pick random pattern
  const patterns = [
    "short_dialogue",
    "short_dialogue",
    "monologue_tf",
    "monologue_tf",
    "interview_mcq",
    "gap_fill",
  ] as const;

  // Language-specific topics
  const topicsEN = [
    "booking a hotel",
    "shopping for clothes",
    "visiting a doctor",
    "planning a trip",
    "discussing school",
    "talking about hobbies",
    "at the airport",
    "job interview basics",
    "sports event",
    "cooking a recipe",
    "public transport",
    "social media",
    "environmental awareness",
    "movie review",
    "daily routine",
  ];

  const topicsDE = [
    "Hotelreservierung",
    "Einkaufen im Supermarkt",
    "Beim Arzt",
    "Reiseplanung",
    "Schulleben und Stundenplan",
    "Hobbys und Freizeit",
    "Am Flughafen",
    "Vorstellungsgespräch",
    "Sportveranstaltung",
    "Kochen und Rezepte",
    "Öffentliche Verkehrsmittel",
    "Soziale Medien und Jugendliche",
    "Umweltbewusstsein im Alltag",
    "Filmkritik",
    "Tagesablauf beschreiben",
  ];

  const topics = language === "de" ? topicsDE : topicsEN;
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const level = state.difficulty <= 3 ? "PP" : "PR";

  const questionId = await generateListeningQuestion(prisma, {
    subjectId: state.subjectId,
    topicId: state.topicId,
    pattern: pattern as any,
    level: level as any,
    topic,
    difficulty: state.difficulty,
    language,
  });

  state.shownIds.add(questionId);

  const question = await fetchQuestion(prisma, questionId);
  if (!question) throw new Error("Generated question not found in DB");

  return { questionId, content: question.content };
}
