// ============================================================================
// Adaptive Difficulty — Elo-inspired difficulty adjustment
// Keeps user in "flow zone" — not too easy, not too hard
// ============================================================================

import { PrismaClient } from "@prisma/client";

const TARGET_SUCCESS_RATE = 0.7; // aim for 70% correct
const ADJUSTMENT_SPEED = 0.15; // how fast difficulty changes
const MIN_DIFFICULTY = 1.0;
const MAX_DIFFICULTY = 5.0;

/**
 * Update adaptive difficulty after an answer
 */
export async function updateAdaptiveDifficulty(
  prisma: PrismaClient,
  userId: string,
  subjectId: string,
  questionDifficulty: number,
  isCorrect: boolean,
): Promise<number> {
  const sp = await prisma.subjectProgress.upsert({
    where: { userId_subjectId: { userId, subjectId } },
    update: {},
    create: { userId, subjectId },
  });

  let newDifficulty = sp.adaptiveDifficulty;

  if (isCorrect) {
    // User got it right — nudge difficulty up
    newDifficulty += ADJUSTMENT_SPEED * (1 - TARGET_SUCCESS_RATE);
  } else {
    // User got it wrong — nudge difficulty down
    newDifficulty -= ADJUSTMENT_SPEED * TARGET_SUCCESS_RATE;
  }

  // Clamp
  newDifficulty = Math.max(
    MIN_DIFFICULTY,
    Math.min(MAX_DIFFICULTY, newDifficulty),
  );
  newDifficulty = Math.round(newDifficulty * 100) / 100;

  await prisma.subjectProgress.update({
    where: { id: sp.id },
    data: { adaptiveDifficulty: newDifficulty },
  });

  return newDifficulty;
}

/**
 * Get recommended difficulty for next question
 * Returns integer 1-5 (maps smooth float to discrete level)
 */
export function getRecommendedDifficulty(adaptiveDifficulty: number): number {
  return Math.round(Math.max(1, Math.min(5, adaptiveDifficulty)));
}

/**
 * Select questions adaptively — mix of recommended + stretch + review
 */
export async function selectAdaptiveQuestions(
  prisma: PrismaClient,
  params: {
    userId: string;
    subjectId: string;
    topicId?: string;
    count: number;
  },
): Promise<string[]> {
  const sp = await prisma.subjectProgress.findUnique({
    where: {
      userId_subjectId: { userId: params.userId, subjectId: params.subjectId },
    },
  });

  const targetDiff = sp?.adaptiveDifficulty || 1.0;
  const recommended = getRecommendedDifficulty(targetDiff);

  // Distribution: 60% at level, 20% one level up (stretch), 20% one level down (consolidation)
  const mainCount = Math.ceil(params.count * 0.6);
  const stretchCount = Math.ceil(params.count * 0.2);
  const easyCount = params.count - mainCount - stretchCount;

  const topicFilter = params.topicId ? { topicId: params.topicId } : {};

  // Get already-answered question IDs to deprioritize
  const recentAnswers = await prisma.answer.findMany({
    where: { userId: params.userId, question: { subjectId: params.subjectId } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { questionId: true },
  });
  const recentIds = recentAnswers.map((a) => a.questionId);

  const fetchQuestions = async (targetDiff: number, take: number) => {
    // First try exact match, then broaden to ±1, then ±2
    for (const range of [0, 1, 2]) {
      const minD = Math.max(1, targetDiff - range);
      const maxD = Math.min(5, targetDiff + range);
      const found = await prisma.question.findMany({
        where: {
          subjectId: params.subjectId,
          difficulty: { gte: minD, lte: maxD },
          isActive: true,
          ...topicFilter,
          ...(recentIds.length > 0 ? { id: { notIn: recentIds } } : {}),
        },
        select: { id: true },
        take: take * 2,
        orderBy: { totalAttempts: "asc" },
      });
      if (found.length >= take) return found.slice(0, take);
      if (found.length > 0 && range === 2) return found; // last resort
    }
    // Absolute fallback — any question from this subject
    return prisma.question.findMany({
      where: { subjectId: params.subjectId, isActive: true, ...topicFilter },
      select: { id: true },
      take,
      orderBy: { totalAttempts: "asc" },
    });
  };

  const [main, stretch, easy] = await Promise.all([
    fetchQuestions(recommended, mainCount),
    fetchQuestions(Math.min(5, recommended + 1), stretchCount),
    fetchQuestions(Math.max(1, recommended - 1), easyCount),
  ]);

  // Deduplicate
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const q of [...main, ...stretch, ...easy]) {
    if (!seen.has(q.id)) {
      seen.add(q.id);
      ids.push(q.id);
    }
  }
  // If not enough questions (because all were recently answered), backfill WITHOUT the recentIds filter
  if (ids.length < params.count) {
    const backfill = await prisma.question.findMany({
      where: {
        subjectId: params.subjectId,
        isActive: true,
        ...topicFilter,
        ...(ids.length > 0 ? { id: { notIn: ids } } : {}),
      },
      select: { id: true },
      take: params.count - ids.length,
      orderBy: { totalAttempts: "asc" },
    });
    for (const q of backfill) {
      if (!seen.has(q.id)) {
        seen.add(q.id);
        ids.push(q.id);
      }
    }
  }

  // Shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids.slice(0, params.count);
}
