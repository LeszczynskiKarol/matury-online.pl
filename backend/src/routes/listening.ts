// ============================================================================
// Listening Session Routes — live generation during user sessions
// backend/src/routes/listening.ts
//
// POST /api/listening/next   — get next listening question (generates live)
// POST /api/listening/start  — start listening mode in a session
//
// Register in app.ts:
//   import { listeningRoutes } from './routes/listening.js';
//   app.register(listeningRoutes, { prefix: '/api/listening' });
// ============================================================================

import { FastifyPluginAsync } from "fastify";
import {
  getNextListeningQuestion,
  cleanupPrefetch,
} from "../services/listening-session.service.js";

export const listeningRoutes: FastifyPluginAsync = async (app) => {
  // ── Start listening mode: creates session + returns first question ─────
  app.post("/start", { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user.userId;
    try {
      const { requireAiCredits } = await import("../services/ai-credits.js");
      await requireAiCredits(app.prisma, userId);
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        error: err.message,
        code: err.code,
        remaining: err.remaining,
      });
    }

    const { subjectId, difficulty } = req.body as {
      subjectId: string;
      difficulty?: number;
    };

    // Get adaptive difficulty if not provided
    let diff = difficulty || 2;
    if (!difficulty) {
      const sp = await app.prisma.subjectProgress.findUnique({
        where: { userId_subjectId: { userId, subjectId } },
      });
      if (sp) diff = Math.round(sp.adaptiveDifficulty);
    }

    // Find or create listening topic
    const { ensureListeningTopic } =
      await import("../services/listening-topic.js");
    const topic = await ensureListeningTopic(app.prisma, subjectId);
    if (!topic) {
      return reply
        .code(400)
        .send({ error: "Ten przedmiot nie obsługuje słuchania" });
    }

    // Create session
    const session = await app.prisma.studySession.create({
      data: {
        userId,
        subjectId,
        type: "PRACTICE",
        topicId: topic.id,
        difficulty: diff,
        questionCount: 0, // unlimited, user decides when to stop
      },
    });

    // Generate first question (user sees loading ~8-12s)
    const question = await getNextListeningQuestion(app.prisma, {
      sessionId: session.id,
      subjectId,
      topicId: topic.id,
      difficulty: diff,
      userId,
    });

    // NEVER return a question without audio
    if (!question.content.audioUrl) {
      return { error: "Audio generation in progress.", retry: true };
    }

    return {
      sessionId: session.id,
      question: {
        id: question.questionId,
        type: "LISTENING",
        difficulty: diff,
        points: question.content.subQuestions?.reduce(
          (s: number, q: any) => s + (q.points || 1),
          0,
        ),
        content: question.content,
        topic: { id: topic.id, name: topic.name, slug: topic.slug },
      },
    };
  });

  // ── Get next listening question (prefetched or generated live) ─────────
  app.post("/next", { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user.userId;
    try {
      const { requireAiCredits } = await import("../services/ai-credits.js");
      await requireAiCredits(app.prisma, userId);
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        error: err.message,
        code: err.code,
        remaining: err.remaining,
      });
    }
    const { sessionId, subjectId, difficulty } = req.body as {
      sessionId: string;
      subjectId: string;
      difficulty?: number;
    };

    // Verify session belongs to user
    const session = await app.prisma.studySession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      return { error: "Session not found" };
    }

    // Find listening topic
    const { ensureListeningTopic } =
      await import("../services/listening-topic.js");
    const topic = await ensureListeningTopic(app.prisma, subjectId);
    if (!topic) return { error: "Listening topic not found" };

    // Get adaptive difficulty
    let diff = difficulty || session.difficulty || 2;
    if (!difficulty) {
      const sp = await app.prisma.subjectProgress.findUnique({
        where: { userId_subjectId: { userId, subjectId } },
      });
      if (sp) diff = Math.round(sp.adaptiveDifficulty);
    }

    // This returns instantly if prefetched, or ~10s if not
    const question = await getNextListeningQuestion(app.prisma, {
      sessionId,
      subjectId,
      topicId: topic.id,
      difficulty: diff,
      userId,
    });

    // NEVER return a question without audio
    if (!question.content.audioUrl) {
      return { error: "Audio generation in progress.", retry: true };
    }

    return {
      question: {
        id: question.questionId,
        type: "LISTENING",
        difficulty: diff,
        points: question.content.subQuestions?.reduce(
          (s: number, q: any) => s + (q.points || 1),
          0,
        ),
        content: question.content,
        topic: { id: topic.id, name: topic.name, slug: topic.slug },
      },
    };
  });

  // ── End listening session ──────────────────────────────────────────────
  app.post("/end", { preHandler: [app.authenticate] }, async (req) => {
    const { sessionId } = req.body as { sessionId: string };

    cleanupPrefetch(sessionId);

    await app.prisma.studySession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    return { ok: true };
  });
};
