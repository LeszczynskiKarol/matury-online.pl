import { FastifyPluginAsync } from "fastify";
import { gradeEssay, suggestEssayTopic } from "../services/ai-grading.js";
import { requireAiCredits } from "../services/ai-credits.js";
import {
  calculateXp,
  awardXp,
  updateStreak,
} from "../services/gamification.js";

export const essayRoutes: FastifyPluginAsync = async (app) => {
  // ── Submit essay — save ONLY after successful grading ────────────────
  app.post(
    "/submit",
    {
      preHandler: [app.requirePremium],
      schema: {
        body: {
          type: "object",
          required: ["subjectId", "topicId", "prompt", "content"],
          properties: {
            subjectId: { type: "string" },
            topicId: { type: "string" },
            prompt: { type: "string" },
            content: { type: "string", minLength: 50 },
            level: {
              type: "string",
              enum: ["podstawowy", "rozszerzony"],
              default: "podstawowy",
            },
            timeSpentMs: { type: "number" },
          },
        },
      },
    },
    async (req) => {
      const userId = req.user.userId;
      const { subjectId, topicId, prompt, content, level, timeSpentMs } =
        req.body as any;

      // Check AI credits before proceeding
      await requireAiCredits(app.prisma, userId, 2);

      const subject = await app.prisma.subject.findUniqueOrThrow({
        where: { id: subjectId },
      });

      // Grade with AI first — do NOT save to DB until grading succeeds
      const evaluation = await gradeEssay({
        subjectSlug: subject.slug,
        prompt,
        content,
        level: level || "podstawowy",
        userId,
      });

      // Only save to DB if grading succeeded (overallScore !== 0 or has feedback)
      if (
        evaluation.overallScore === 0 &&
        evaluation.overallFeedback.includes("Wystąpił błąd")
      ) {
        return {
          submissionId: null,
          evaluation,
          xpEarned: 0,
          error: "Ocena nie powiodła się. Wypracowanie nie zostało zapisane.",
        };
      }

      // Create submission with grading already attached
      const submission = await app.prisma.essaySubmission.create({
        data: {
          userId,
          subjectId,
          topicId,
          prompt,
          content,
          wordCount: content.split(/\s+/).length,
          timeSpentMs: timeSpentMs || null,
          evaluation: evaluation as any,
          totalScore: evaluation.overallScore,
          gradedAt: new Date(),
        },
      });

      // XP
      const xp = calculateXp({
        questionType: "ESSAY",
        isCorrect: evaluation.overallScore >= 50,
        score: evaluation.overallScore / 100,
        difficulty: 3,
        currentStreak: 0,
      });

      const [xpResult, streakResult] = await Promise.all([
        awardXp(app.prisma, userId, subjectId, xp),
        updateStreak(app.prisma, userId),
      ]);

      return {
        submissionId: submission.id,
        evaluation,
        xpEarned: xp,
        gamification: {
          totalXp: xpResult.totalXp,
          subjectLevel: xpResult.subjectLevel,
          leveledUp: xpResult.leveledUp,
          streak: streakResult.currentStreak,
        },
      };
    },
  );

  // ── Suggest essay topic (AI) — checks history for diversity ──────────
  app.post(
    "/suggest-topic",
    {
      preHandler: [app.requirePremium],
      schema: {
        body: {
          type: "object",
          required: ["subjectId"],
          properties: {
            subjectId: { type: "string" },
            topicId: { type: "string" },
            level: {
              type: "string",
              enum: ["podstawowy", "rozszerzony"],
              default: "podstawowy",
            },
          },
        },
      },
    },
    async (req) => {
      const userId = req.user.userId;
      const { subjectId, topicId, level } = req.body as any;

      await requireAiCredits(app.prisma, userId, 1);

      const subject = await app.prisma.subject.findUniqueOrThrow({
        where: { id: subjectId },
      });

      // Get topic name if topicId provided
      let topicName: string | undefined;
      if (topicId) {
        const topic = await app.prisma.topic.findUnique({
          where: { id: topicId },
        });
        topicName = topic?.name;
      }

      // suggestEssayTopic handles history check + saving internally
      const suggestedTopic = await suggestEssayTopic({
        prisma: app.prisma,
        subjectSlug: subject.slug,
        subjectId: subject.id,
        level: level || "podstawowy",
        topicName,
        userId,
      });

      const suggestion = await suggestEssayTopic({
        prisma: app.prisma,
        subjectSlug: subject.slug,
        subjectId: subject.id,
        level: level || "podstawowy",
        topicName,
        userId,
      });

      return { topic: suggestion.topic, hints: suggestion.hints };
    },
  );

  // ── Get user's essay history ─────────────────────────────────────────
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
            offset: { type: "number", default: 0 },
          },
        },
      },
    },
    async (req) => {
      const { subjectId, limit, offset } = req.query as any;
      return app.prisma.essaySubmission.findMany({
        where: {
          userId: req.user.userId,
          ...(subjectId ? { subjectId } : {}),
          gradedAt: { not: null }, // only show graded essays
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          subjectId: true,
          topicId: true,
          prompt: true,
          totalScore: true,
          wordCount: true,
          gradedAt: true,
          createdAt: true,
        },
      });
    },
  );

  // ── Get single essay with full evaluation ────────────────────────────
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate],
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const essay = await app.prisma.essaySubmission.findUnique({
        where: { id },
      });
      if (!essay || essay.userId !== req.user.userId) {
        return reply.code(404).send({ error: "Not found" });
      }
      return essay;
    },
  );
};
