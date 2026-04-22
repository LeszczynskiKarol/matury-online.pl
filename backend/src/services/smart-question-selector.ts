// ============================================================================
// Smart Question Selector — Scoring-based selection with diversity guarantees
// Adapted from maturapolski's intelligent selection algorithm
// ============================================================================

import { PrismaClient } from "@prisma/client";

interface CandidateQuestion {
  id: string;
  type: string;
  difficulty: number;
  points: number;
  topicId: string;
  content: any;
  source: string | null;
  topic: { id: string; name: string; slug: string };
  totalAttempts: number;
  correctCount: number;
}

interface SelectionParams {
  userId: string;
  subjectId: string;
  topicId?: string;
  topicIds?: string[];
  types?: string[];
  difficulties?: number[];
  sources?: string[];
  exclude?: string[]; // IDs to hard-exclude (already loaded in frontend)
  count: number;
  context?: "SESSION" | "POOL"; // SESSION = initial load, POOL = live filter / skip refill
}

interface ScoredQuestion {
  question: CandidateQuestion;
  score: number;
}

const QUESTION_SELECT = {
  id: true,
  type: true,
  difficulty: true,
  points: true,
  topicId: true,
  content: true,
  source: true,
  topic: { select: { id: true, name: true, slug: true, parentId: true } }, // ← dodaj parentId
  totalAttempts: true,
  correctCount: true,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ────────────────────────────────────────────────────────────────────────────

export async function selectSmartQuestions(
  prisma: PrismaClient,
  params: SelectionParams,
): Promise<{ questions: CandidateQuestion[]; total: number }> {
  const {
    userId,
    subjectId,
    topicId,
    topicIds,
    types,
    difficulties,
    sources,
    exclude = [],
    count,
  } = params;

  // ── 1. Build WHERE clause ────────────────────────────────────────────
  const where: any = { subjectId, isActive: true };

  const topicFilter = topicIds?.length ? topicIds : topicId ? [topicId] : [];
  if (topicFilter.length > 0) where.topicId = { in: topicFilter };
  if (types?.length) where.type = { in: types };
  if (difficulties?.length) where.difficulty = { in: difficulties };
  if (sources?.length) where.source = { in: sources };
  if (exclude.length > 0) where.id = { notIn: exclude };

  // Total matching (before user-history filtering)
  const total = await prisma.question.count({ where });

  // ── 2. Load user history (last 200 answers for this subject) ─────────
  const recentAnswers = await prisma.answer.findMany({
    where: {
      userId,
      question: { subjectId },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      questionId: true,
      createdAt: true,
      isCorrect: true,
      score: true,
    },
  });

  const answeredIds = new Set(recentAnswers.map((a) => a.questionId));

  // Map: questionId → { lastAnswered, wasCorrect, answerCount }
  const historyMap = new Map<
    string,
    {
      lastAnswered: Date;
      wasCorrect: boolean;
      answerCount: number;
      wasSkipped: boolean;
    }
  >();
  for (const ans of recentAnswers) {
    const isSkip = ans.isCorrect === null && ans.score === 0;
    if (!historyMap.has(ans.questionId)) {
      historyMap.set(ans.questionId, {
        lastAnswered: ans.createdAt,
        wasCorrect: ans.isCorrect ?? false,
        answerCount: 1,
        wasSkipped: isSkip,
      });
    } else {
      historyMap.get(ans.questionId)!.answerCount++;
    }
  }

  // ── 3. Load candidates — prefer unanswered, backfill with answered ───
  // First: unanswered questions
  const freshWhere = {
    ...where,
    ...(answeredIds.size > 0
      ? {
          id: {
            notIn: [...(exclude || []), ...answeredIds],
          },
        }
      : {}),
  };

  let candidates = await prisma.question.findMany({
    where: freshWhere,
    select: QUESTION_SELECT,
    take: Math.min(count * 5, 200), // oversample
    orderBy: { totalAttempts: "asc" },
  });

  // If not enough fresh questions, backfill with already-answered ones
  if (candidates.length < count) {
    const freshIds = new Set(candidates.map((q) => q.id));
    const backfillExclude = [...exclude, ...Array.from(freshIds)];

    const backfill = await prisma.question.findMany({
      where: {
        ...where,
        ...(backfillExclude.length > 0
          ? { id: { notIn: backfillExclude } }
          : {}),
      },
      select: QUESTION_SELECT,
      take: Math.min((count - candidates.length) * 3, 100),
      orderBy: { totalAttempts: "asc" },
    });

    candidates = [...candidates, ...backfill];
  }

  if (candidates.length === 0) {
    return { questions: [], total };
  }

  // ── 4. Score each candidate ──────────────────────────────────────────
  const scored = candidates.map((q) =>
    scoreQuestion(q, historyMap, answeredIds),
  );

  // ── 5. Diversity-aware selection (round-robin + scoring) ─────────────
  const selected = diverseSelect(scored, count);

  return {
    questions: selected.map((s) => s.question),
    total,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// SCORING — assigns a numeric score to each candidate
// ────────────────────────────────────────────────────────────────────────────

function scoreQuestion(
  q: CandidateQuestion,
  historyMap: Map<
    string,
    {
      lastAnswered: Date;
      wasCorrect: boolean;
      answerCount: number;
      wasSkipped: boolean;
    }
  >,
  answeredIds: Set<string>,
): ScoredQuestion {
  let score = 1000;

  // ── Freshness bonus (never answered = huge bonus) ────────────────────
  if (!answeredIds.has(q.id)) {
    score += 500;
  } else {
    const history = historyMap.get(q.id);
    if (history) {
      const daysSince =
        (Date.now() - history.lastAnswered.getTime()) / 86_400_000;

      if (daysSince > 7) {
        score += Math.min(400, Math.floor((daysSince - 7) * 40));
      }

      if (daysSince < 2) {
        score -= 300;
      }

      // Skipnięte pytania — DODATKOWA kara
      if (history.wasSkipped) {
        score -= 400; // silniejsza kara niż zwykłe "odpowiadane niedawno"
      }

      if (
        !history.wasCorrect &&
        !history.wasSkipped &&
        daysSince > 0.04 &&
        daysSince < 1
      ) {
        score += Math.floor(200 * (1 - Math.exp(-daysSince * 4)));
      }

      if (history.answerCount > 3) {
        score -= history.answerCount * 50;
      }
    }
  }

  if (q.totalAttempts === 0) {
    score += 200;
  } else if (q.totalAttempts < 5) {
    score += 100;
  }

  score += Math.floor(Math.random() * 120) - 60;

  return { question: q, score };
}

// ────────────────────────────────────────────────────────────────────────────
// DIVERSE SELECT — picks top-scored questions with topic/type diversity
// ────────────────────────────────────────────────────────────────────────────

function diverseSelect(
  scored: ScoredQuestion[],
  count: number,
): ScoredQuestion[] {
  scored.sort((a, b) => b.score - a.score);

  const selected: ScoredQuestion[] = [];
  const topicCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const workCounts = new Map<string, number>();
  const epochCounts = new Map<string, number>(); // ← NOWE: parent topic = epoka

  for (const candidate of scored) {
    if (selected.length >= count) break;

    const q = candidate.question;
    const topicCount = topicCounts.get(q.topicId) || 0;
    const typeCount = typeCounts.get(q.type) || 0;
    const work = (q.content as any)?.work || "__none__";
    const workCount = workCounts.get(work) || 0;

    // Parent topic = epoch grouping (Romantyzm, Pozytywizm, etc.)
    const epochKey = (q.topic as any)?.parentId || q.topicId;
    const epochCount = epochCounts.get(epochKey) || 0;

    let adjustedScore = candidate.score;

    // Penalize same topic (lektura) — max 2
    if (topicCount >= 2) {
      adjustedScore -= topicCount * 200;
    }

    // Penalize same type — max 3
    if (typeCount >= 3) {
      adjustedScore -= typeCount * 100;
    }

    // Penalize same literary work — max 1
    if (work !== "__none__" && workCount >= 1) {
      adjustedScore -= workCount * 300;
    }

    // ── NOWE: Penalize same epoch — max 3 per epoch ───────────────────
    if (epochCount >= 3) {
      adjustedScore -= (epochCount - 2) * 250;
    } else if (epochCount === 0) {
      adjustedScore += 150; // bonus za nową epokę
    }

    if (adjustedScore < 0 && scored.length - selected.length > count * 0.5) {
      continue;
    }

    selected.push(candidate);
    topicCounts.set(q.topicId, topicCount + 1);
    typeCounts.set(q.type, typeCount + 1);
    workCounts.set(work, workCount + 1);
    epochCounts.set(epochKey, epochCount + 1);
  }

  // Backfill if diversity was too aggressive
  if (selected.length < count) {
    const selectedIds = new Set(selected.map((s) => s.question.id));
    for (const candidate of scored) {
      if (selected.length >= count) break;
      if (!selectedIds.has(candidate.question.id)) {
        selected.push(candidate);
      }
    }
  }

  // Final shuffle
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }

  return selected;
}
