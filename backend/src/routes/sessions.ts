import { FastifyPluginAsync } from "fastify";
import {
  selectAdaptiveQuestions,
  getRecommendedDifficulty,
} from "../services/adaptive-difficulty.js";
import { getDueCards } from "../services/spaced-repetition.js";

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  // ── Create session ───────────────────────────────────────────────────────
  app.post(
    "/create",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["subjectId", "type"],
          properties: {
            subjectId: { type: "string" },
            type: {
              type: "string",
              enum: [
                "PRACTICE",
                "TOPIC_DRILL",
                "REVIEW",
                "MOCK_EXAM",
                "ADAPTIVE",
              ],
            },
            topicId: { type: "string" },
            difficulty: { type: "number", minimum: 1, maximum: 5 },
            questionCount: {
              type: "number",
              minimum: 1,
              maximum: 50,
              default: 10,
            },
          },
        },
      },
    },
    async (req) => {
      const userId = req.user.userId;
      const {
        subjectId,
        type,
        topicId,
        difficulty,
        questionCount = 10,
      } = req.body as any;

      // Premium check for TOPIC_DRILL and REVIEW
      if (["TOPIC_DRILL", "REVIEW"].includes(type)) {
        const user = await app.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { subscriptionStatus: true, subscriptionEnd: true },
        });
        const isPremium =
          user.subscriptionStatus === "ACTIVE" ||
          (user.subscriptionStatus === "ONE_TIME" &&
            user.subscriptionEnd &&
            user.subscriptionEnd > new Date());
        if (!isPremium) {
          return {
            error: "Premium required for topic drills and reviews",
            code: "PREMIUM_REQUIRED",
          };
        }
      }

      // Create session
      const session = await app.prisma.studySession.create({
        data: {
          userId,
          subjectId,
          type,
          topicId: topicId || null,
          difficulty: difficulty || null,
          questionCount,
        },
      });

      // Select questions based on session type
      let questionIds: string[] = [];

      switch (type) {
        case "ADAPTIVE": {
          questionIds = await selectAdaptiveQuestions(app.prisma, {
            userId,
            subjectId,
            topicId,
            count: questionCount,
          });
          break;
        }
        case "REVIEW": {
          const cards = await getDueCards(app.prisma, userId, {
            topicId,
            limit: questionCount,
          });
          questionIds = cards.map((c) => c.questionId);
          break;
        }
        case "TOPIC_DRILL": {
          const questions = await app.prisma.question.findMany({
            where: {
              subjectId,
              ...(topicId ? { topicId } : {}),
              ...(difficulty ? { difficulty } : {}),
              isActive: true,
            },
            select: { id: true },
            take: questionCount,
            orderBy: { totalAttempts: "asc" },
          });
          questionIds = questions.map((q) => q.id);
          break;
        }
        case "PRACTICE":
        case "MOCK_EXAM":
        default: {
          // Random selection — difficulty as range, not exact
          const diffFilter = difficulty
            ? {
                difficulty: {
                  gte: Math.max(1, difficulty - 1),
                  lte: Math.min(5, difficulty + 1),
                },
              }
            : {};
          const questions = await app.prisma.question.findMany({
            where: {
              subjectId,
              isActive: true,
              ...(topicId ? { topicId } : {}),
              ...diffFilter,
            },
            select: { id: true },
            take: questionCount * 3,
          });
          // Shuffle and take
          const shuffled = questions.sort(() => Math.random() - 0.5);
          questionIds = shuffled.slice(0, questionCount).map((q) => q.id);
          break;
        }
      }

      // Fetch full questions
      const questions = await app.prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: {
          id: true,
          type: true,
          difficulty: true,
          points: true,
          content: true,
          topic: { select: { id: true, name: true, slug: true } },
        },
      });

      return {
        sessionId: session.id,
        type: session.type,
        questions,
      };
    },
  );

  // ── Complete session ─────────────────────────────────────────────────────
  app.post(
    "/:id/complete",
    {
      preHandler: [app.authenticate],
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const session = await app.prisma.studySession.findUnique({
        where: { id },
      });
      if (!session || session.userId !== req.user.userId) {
        return reply.code(404).send({ error: "Session not found" });
      }

      const updated = await app.prisma.studySession.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      // Update daily goal minutes
      if (session.totalTimeMs > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await app.prisma.dailyGoal.upsert({
          where: { userId_date: { userId: session.userId, date: today } },
          update: {
            minutesSpent: {
              increment: Math.round(session.totalTimeMs / 60000),
            },
          },
          create: {
            userId: session.userId,
            date: today,
            minutesSpent: Math.round(session.totalTimeMs / 60000),
          },
        });
      }

      return {
        sessionId: updated.id,
        status: updated.status,
        questionsAnswered: updated.questionsAnswered,
        correctAnswers: updated.correctAnswers,
        accuracy:
          updated.questionsAnswered > 0
            ? Math.round(
                (updated.correctAnswers / updated.questionsAnswered) * 100,
              )
            : 0,
        totalXpEarned: updated.totalXpEarned,
        totalTimeMs: updated.totalTimeMs,
      };
    },
  );

  // ── Get session history ──────────────────────────────────────────────────
  app.get(
    "/history",
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            subjectId: { type: "string" },
            limit: { type: "number", default: 20 },
          },
        },
      },
    },
    async (req) => {
      const { subjectId, limit } = req.query as any;
      return app.prisma.studySession.findMany({
        where: {
          userId: req.user.userId,
          ...(subjectId ? { subjectId } : {}),
          status: "COMPLETED",
        },
        orderBy: { completedAt: "desc" },
        take: limit,
        select: {
          id: true,
          subjectId: true,
          type: true,
          questionsAnswered: true,
          correctAnswers: true,
          totalXpEarned: true,
          totalTimeMs: true,
          startedAt: true,
          completedAt: true,
        },
      });
    },
  );
};
