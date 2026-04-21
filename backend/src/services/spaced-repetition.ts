// ============================================================================
// Spaced Repetition — SM-2 Algorithm
// Used for review cards (topic drills, flashcard-style review)
// ============================================================================

import { PrismaClient } from "@prisma/client";

/**
 * SM-2 quality ratings:
 * 5 — perfect, no hesitation
 * 4 — correct with slight hesitation
 * 3 — correct with significant difficulty
 * 2 — incorrect, but close / remembered after seeing answer
 * 1 — incorrect, vaguely remembered
 * 0 — complete blank
 */

interface SM2Result {
  easeFactor: number;
  interval: number; // days
  repetitions: number;
  nextReviewAt: Date;
}

export function calculateSM2(params: {
  quality: number; // 0-5
  currentEaseFactor: number;
  currentInterval: number;
  currentRepetitions: number;
}): SM2Result {
  const { quality, currentEaseFactor, currentInterval, currentRepetitions } =
    params;
  const q = Math.min(5, Math.max(0, quality));

  let newEF = currentEaseFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  newEF = Math.max(1.3, newEF); // floor at 1.3

  let newInterval: number;
  let newReps: number;

  if (q < 3) {
    // Failed — reset
    newInterval = 1;
    newReps = 0;
  } else {
    newReps = currentRepetitions + 1;
    if (newReps === 1) {
      newInterval = 1;
    } else if (newReps === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(currentInterval * newEF);
    }
  }

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

  return {
    easeFactor: Math.round(newEF * 100) / 100,
    interval: newInterval,
    repetitions: newReps,
    nextReviewAt,
  };
}

/**
 * Map answer correctness → SM-2 quality
 */
export function answerToQuality(
  isCorrect: boolean,
  score: number,
  timeSpentMs?: number,
): number {
  if (!isCorrect && score < 0.2) return 0;
  if (!isCorrect && score < 0.5) return 1;
  if (!isCorrect) return 2;
  // Correct — rate by confidence (score + speed)
  if (score >= 0.95) return 5;
  if (score >= 0.8) return 4;
  return 3;
}

/**
 * Get cards due for review
 */
export async function getDueCards(
  prisma: PrismaClient,
  userId: string,
  options?: { topicId?: string; limit?: number },
): Promise<
  {
    id: string;
    questionId: string;
    topicId: string;
    easeFactor: number;
    interval: number;
  }[]
> {
  return prisma.reviewCard.findMany({
    where: {
      userId,
      nextReviewAt: { lte: new Date() },
      ...(options?.topicId ? { topicId: options.topicId } : {}),
    },
    orderBy: { nextReviewAt: "asc" },
    take: options?.limit || 20,
    select: {
      id: true,
      questionId: true,
      topicId: true,
      easeFactor: true,
      interval: true,
    },
  });
}

/**
 * Process a review — update card with SM-2 result
 */
export async function processReview(
  prisma: PrismaClient,
  cardId: string,
  quality: number,
): Promise<SM2Result> {
  const card = await prisma.reviewCard.findUniqueOrThrow({
    where: { id: cardId },
  });

  const result = calculateSM2({
    quality,
    currentEaseFactor: card.easeFactor,
    currentInterval: card.interval,
    currentRepetitions: card.repetitions,
  });

  await prisma.reviewCard.update({
    where: { id: cardId },
    data: {
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      nextReviewAt: result.nextReviewAt,
      lastReviewAt: new Date(),
      lastQuality: quality,
    },
  });

  return result;
}

/**
 * Ensure a review card exists for a question (create if not)
 */
// backend/src/services/spaced-repetition.ts
export async function ensureReviewCard(
  prisma: PrismaClient,
  userId: string,
  questionId: string,
  topicId: string,
): Promise<void> {
  // Pomiń LISTENING — powtórki bez audio są bezużyteczne
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { type: true },
  });
  if (q?.type === "LISTENING") return;

  await prisma.reviewCard.upsert({
    where: { userId_questionId: { userId, questionId } },
    update: {},
    create: { userId, questionId, topicId },
  });
}
