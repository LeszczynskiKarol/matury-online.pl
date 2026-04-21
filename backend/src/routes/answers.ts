// ============================================================================
// Answer Routes — Core Learning Loop
// submit → grade → xp → adaptive difficulty → spaced repetition → achievements
// ============================================================================

import { Prisma } from "@prisma/client";
import { FastifyPluginAsync } from "fastify";
import { gradeListeningQuestion } from "../services/listening-grading.js";
import { gradeOpenQuestion } from "../services/ai-grading.js";
import {
  calculateXp,
  awardXp,
  updateStreak,
  checkAchievements,
} from "../services/gamification.js";
import { updateAdaptiveDifficulty } from "../services/adaptive-difficulty.js";
import {
  ensureReviewCard,
  answerToQuality,
  processReview,
} from "../services/spaced-repetition.js";

export const answerRoutes: FastifyPluginAsync = async (app) => {
  // ── Submit answer ────────────────────────────────────────────────────────
  app.post(
    "/submit",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["questionId", "response"],
          properties: {
            questionId: { type: "string" },
            response: {}, // flexible — type depends on question
            sessionId: { type: "string" },
            timeSpentMs: { type: "number" },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.userId;
      const { questionId, response, sessionId, timeSpentMs } = req.body as any;

      // ── Fetch question ───────────────────────────────────────────────────
      const question = await app.prisma.question.findUnique({
        where: { id: questionId },
        include: { subject: { select: { slug: true } } },
      });
      if (!question)
        return reply.code(404).send({ error: "Question not found" });

      // ── Premium required ─────────────────────────────────────────────────
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: req.user.userId },
        select: {
          subscriptionStatus: true,
          subscriptionEnd: true,
          currentStreak: true,
        },
      });

      const now = new Date();
      const isPremium =
        user.subscriptionStatus === "ACTIVE" ||
        (user.subscriptionStatus === "ONE_TIME" &&
          user.subscriptionEnd &&
          user.subscriptionEnd > now) ||
        (user.subscriptionStatus === "CANCELLED" &&
          user.subscriptionEnd &&
          user.subscriptionEnd > now);

      if (!isPremium) {
        return reply.code(403).send({
          error: "Dostęp do zadań wymaga aktywnej subskrypcji Premium.",
          code: "PREMIUM_REQUIRED",
        });
      }
      // ── Grade ────────────────────────────────────────────────────────────
      const content = question.content as Record<string, any>;
      let isCorrect: boolean | null = null;
      let score = 0;
      let aiGrading = null;

      switch (question.type) {
        case "CLOSED": {
          isCorrect = response === content.correctAnswer;
          score = isCorrect ? 1.0 : 0.0;
          break;
        }
        case "LISTENING": {
          // Grading is deterministic (no AI) — credits were already consumed
          // at generation time in /listening/start and /listening/next.
          const result = gradeListeningQuestion(
            question.content as any,
            response,
          );
          isCorrect = result.isCorrect;
          score = result.score;
          break;
        }
        case "MULTI_SELECT": {
          const correct = new Set(content.correctAnswers as string[]);
          const submitted = new Set(response as string[]);
          const intersection = [...correct].filter((x) => submitted.has(x));
          score = intersection.length / correct.size;
          isCorrect = score >= 1.0;
          break;
        }
        case "TRUE_FALSE": {
          const statements = content.statements as {
            text: string;
            isTrue: boolean;
          }[];
          let correctCount = 0;
          const userAnswers = response as boolean[];
          statements.forEach((s, i) => {
            if (s.isTrue === userAnswers[i]) correctCount++;
          });
          score = correctCount / statements.length;
          isCorrect = score >= 1.0;
          break;
        }
        case "FILL_IN": {
          const blanks = content.blanks as {
            id: string;
            acceptedAnswers: string[];
          }[];
          let correctCount = 0;
          const userAnswers = response as Record<string, string>;
          for (const blank of blanks) {
            const userAns = (userAnswers[blank.id] || "").trim().toLowerCase();
            if (
              blank.acceptedAnswers.some(
                (a: string) => a.toLowerCase() === userAns,
              )
            ) {
              correctCount++;
            }
          }
          score = correctCount / blanks.length;
          isCorrect = score >= 1.0;
          break;
        }
        case "MATCHING": {
          const pairs = content.pairs as { left: string; right: string }[];
          const userPairs = response as Record<string, string>;
          let correctCount = 0;
          for (const pair of pairs) {
            if (userPairs[pair.left] === pair.right) correctCount++;
          }
          score = correctCount / pairs.length;
          isCorrect = score >= 1.0;
          break;
        }
        case "ORDERING": {
          const correctOrder = content.correctOrder as number[];
          const userOrder = response as number[];
          let correctCount = 0;
          correctOrder.forEach((v, i) => {
            if (v === userOrder[i]) correctCount++;
          });
          score = correctCount / correctOrder.length;
          isCorrect = score >= 1.0;
          break;
        }
        case "OPEN": {
          // AI grading — check credits first
          const { requireAiCredits } =
            await import("../services/ai-credits.js");
          await requireAiCredits(app.prisma, userId);
          const result = await gradeOpenQuestion({
            subjectSlug: question.subject.slug,
            question: content.question,
            rubric: content.rubric,
            maxPoints: content.maxPoints,
            userAnswer: response as string,
            sampleAnswer: content.sampleAnswer,
          });
          isCorrect = result.isCorrect;
          score = result.score;
          aiGrading = {
            feedback: result.feedback,
            correctAnswer: result.correctAnswer,
          };
          break;
        }
        // ESSAY is handled separately via /api/essays
      }

      // ── Calculate XP ─────────────────────────────────────────────────────
      const xp = calculateXp({
        questionType: question.type,
        isCorrect: isCorrect ?? false,
        score,
        difficulty: question.difficulty,
        currentStreak: user.currentStreak,
      });

      // ── Save answer ──────────────────────────────────────────────────────
      const answer = await app.prisma.answer.create({
        data: {
          user: { connect: { id: userId } },
          question: { connect: { id: questionId } },
          ...(sessionId ? { session: { connect: { id: sessionId } } } : {}),
          response,
          isCorrect,
          score,
          pointsEarned: question.points,
          xpEarned: xp || 0,
          aiGrading: aiGrading ?? Prisma.JsonNull,
          gradedAt: new Date(),
          timeSpentMs: timeSpentMs || null,
        },
      });

      // ── Update stats ─────────────────────────────────────────────────────
      await app.prisma.question.update({
        where: { id: questionId },
        data: {
          totalAttempts: { increment: 1 },
          ...(isCorrect ? { correctCount: { increment: 1 } } : {}),
        },
      });

      await app.prisma.subjectProgress.upsert({
        where: { userId_subjectId: { userId, subjectId: question.subjectId } },
        update: {
          questionsAnswered: { increment: 1 },
          ...(isCorrect ? { correctAnswers: { increment: 1 } } : {}),
        },
        create: {
          userId,
          subjectId: question.subjectId,
          questionsAnswered: 1,
          correctAnswers: isCorrect ? 1 : 0,
        },
      });

      // ── Session update ───────────────────────────────────────────────────
      if (sessionId) {
        await app.prisma.studySession.update({
          where: { id: sessionId },
          data: {
            questionsAnswered: { increment: 1 },
            ...(isCorrect ? { correctAnswers: { increment: 1 } } : {}),
            totalXpEarned: { increment: xp },
            totalTimeMs: { increment: timeSpentMs || 0 },
          },
        });
      }

      // ── Gamification pipeline ────────────────────────────────────────────
      const [xpResult, streakResult, diffResult] = await Promise.all([
        awardXp(app.prisma, userId, question.subjectId, xp),
        updateStreak(app.prisma, userId),
        updateAdaptiveDifficulty(
          app.prisma,
          userId,
          question.subjectId,
          question.difficulty,
          isCorrect ?? false,
        ),
      ]);

      // Spaced repetition — create/update review card
      await ensureReviewCard(app.prisma, userId, questionId, question.topicId);
      const quality = answerToQuality(isCorrect ?? false, score, timeSpentMs);

      const reviewCard = await app.prisma.reviewCard.findUnique({
        where: { userId_questionId: { userId, questionId } },
      });
      if (reviewCard) {
        await processReview(app.prisma, reviewCard.id, quality);
      }

      // Daily goal
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await app.prisma.dailyGoal.upsert({
        where: { userId_date: { userId, date: today } },
        update: {
          questionsCompleted: { increment: 1 },
          xpEarned: { increment: xp },
        },
        create: {
          userId,
          date: today,
          questionsCompleted: 1,
          xpEarned: xp,
        },
      });

      // Check achievements (async, non-blocking)
      const achievementResult = checkAchievements(app.prisma, userId).catch(
        () => ({ unlocked: [] }),
      );

      const achievements = await achievementResult;

      // ── Response ─────────────────────────────────────────────────────────
      return {
        answerId: answer.id,
        isCorrect,
        score,
        xpEarned: xp,
        aiGrading,
        explanation: question.explanation,
        correctAnswer: isCorrect
          ? null
          : getCorrectAnswer(question.type, content),

        // Gamification feedback
        gamification: {
          totalXp: xpResult.totalXp,
          globalLevel: xpResult.globalLevel,
          subjectXp: xpResult.subjectXp,
          subjectLevel: xpResult.subjectLevel,
          leveledUp: xpResult.leveledUp,
          streak: streakResult.currentStreak,
          isNewDay: streakResult.isNewDay,
          adaptiveDifficulty: diffResult,
          achievements: achievements.unlocked,
        },
      };
    },
  );
};

// ── Helper: extract correct answer for feedback ──────────────────────────

function getCorrectAnswer(type: string, content: Record<string, any>): any {
  switch (type) {
    case "CLOSED":
      return content.correctAnswer;
    case "MULTI_SELECT":
      return content.correctAnswers;
    case "TRUE_FALSE":
      return content.statements?.map((s: any) => s.isTrue);
    case "FILL_IN":
      return content.blanks?.map((b: any) => b.acceptedAnswers[0]);
    case "MATCHING":
      return content.pairs;
    case "ORDERING":
      return content.correctOrder;
    default:
      return null;
  }
}
