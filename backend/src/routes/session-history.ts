// ============================================================================
// Session History Routes — detailed session replay
// File: backend/src/routes/session-history.ts
// Register in server.ts: await app.register(sessionHistoryRoutes, { prefix: "/api/sessions" });
// ============================================================================

import { FastifyPluginAsync } from "fastify";

export const sessionHistoryRoutes: FastifyPluginAsync = async (app) => {
  // ── List all sessions (paginated, richer than existing /history) ─────────
  app.get(
    "/my-history",
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
      const userId = req.user.userId;
      const { subjectId, limit, offset } = req.query as any;

      const where: any = { userId };
      if (subjectId) where.subjectId = subjectId;

      const [sessions, total] = await Promise.all([
        app.prisma.studySession.findMany({
          where,
          orderBy: { startedAt: "desc" },
          take: limit,
          skip: offset,
          select: {
            id: true,
            type: true,
            status: true,
            questionCount: true,
            questionsAnswered: true,
            correctAnswers: true,
            totalXpEarned: true,
            totalTimeMs: true,
            startedAt: true,
            completedAt: true,
            subject: {
              select: {
                id: true,
                slug: true,
                name: true,
                icon: true,
                color: true,
              },
            },
            // Count answers by action type
            _count: { select: { answers: true } },
          },
        }),
        app.prisma.studySession.count({ where }),
      ]);

      // Enrich with action breakdown per session
      const sessionIds = sessions.map((s) => s.id);
      const actionBreakdown = await app.prisma.$queryRaw<
        { sessionId: string; action: string; count: number }[]
      >`
        SELECT "sessionId", "action", COUNT(*)::int as count
        FROM "Answer"
        WHERE "sessionId" = ANY(${sessionIds})
        GROUP BY "sessionId", "action"
      `;

      const breakdownMap = new Map<string, Record<string, number>>();
      for (const row of actionBreakdown) {
        if (!breakdownMap.has(row.sessionId)) {
          breakdownMap.set(row.sessionId, {});
        }
        breakdownMap.get(row.sessionId)![row.action] = row.count;
      }

      // Total AI credits per session
      const creditsPerSession = await app.prisma.$queryRaw<
        { sessionId: string; totalCredits: number }[]
      >`
        SELECT "sessionId", SUM("aiCreditsUsed")::int as "totalCredits"
        FROM "Answer"
        WHERE "sessionId" = ANY(${sessionIds})
        GROUP BY "sessionId"
      `;
      const creditsMap = new Map(
        creditsPerSession.map((r) => [r.sessionId, r.totalCredits]),
      );

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          type: s.type,
          status: s.status,
          subject: s.subject,
          questionCount: s.questionCount,
          questionsAnswered: s.questionsAnswered,
          correctAnswers: s.correctAnswers,
          accuracy:
            s.questionsAnswered > 0
              ? Math.round((s.correctAnswers / s.questionsAnswered) * 100)
              : 0,
          totalXpEarned: s.totalXpEarned,
          totalTimeMs: s.totalTimeMs,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          actionBreakdown: breakdownMap.get(s.id) || {},
          aiCreditsUsed: creditsMap.get(s.id) || 0,
          totalAnswers: s._count.answers,
        })),
        total,
      };
    },
  );

  // ── Single session detail — full replay ─────────────────────────────────
  app.get(
    "/:id/history",
    {
      preHandler: [app.authenticate],
    },
    async (req, reply) => {
      const userId = req.user.userId;
      const { id } = req.params as { id: string };

      // Verify ownership
      const session = await app.prisma.studySession.findUnique({
        where: { id },
        include: {
          subject: {
            select: {
              id: true,
              slug: true,
              name: true,
              icon: true,
              color: true,
            },
          },
        },
      });
      if (!session || session.userId !== userId) {
        return reply.code(404).send({ error: "Session not found" });
      }

      // Get all answers for this session with full question data
      const answers = await app.prisma.answer.findMany({
        where: { sessionId: id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          questionId: true,
          response: true,
          action: true,
          isCorrect: true,
          score: true,
          pointsEarned: true,
          xpEarned: true,
          aiGrading: true,
          aiCreditsUsed: true,
          timeSpentMs: true,
          createdAt: true,
          question: {
            select: {
              id: true,
              type: true,
              difficulty: true,
              points: true,
              content: true,
              explanation: true,
              source: true,
              topic: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });

      // Also get view events to find questions that were viewed but never answered
      const viewEvents = await app.prisma.questionViewEvent.findMany({
        where: { sessionId: id, userId },
        orderBy: { createdAt: "asc" },
        select: {
          questionId: true,
          createdAt: true,
        },
      });

      // Find question IDs that were viewed but not in answers
      const answeredQIds = new Set(answers.map((a) => a.questionId));
      const viewedOnlyQIds = [
        ...new Set(
          viewEvents
            .filter((v) => !answeredQIds.has(v.questionId))
            .map((v) => v.questionId),
        ),
      ];

      // Fetch those questions
      let viewedOnlyQuestions: any[] = [];
      if (viewedOnlyQIds.length > 0) {
        viewedOnlyQuestions = await app.prisma.question.findMany({
          where: { id: { in: viewedOnlyQIds } },
          select: {
            id: true,
            type: true,
            difficulty: true,
            points: true,
            content: true,
            explanation: true,
            source: true,
            topic: { select: { id: true, name: true, slug: true } },
          },
        });
      }

      // Build timeline: merge answers + view-only events, sorted by time
      const timeline: any[] = [];

      // Add answered/skipped/revealed questions
      for (const a of answers) {
        const viewEvent = viewEvents.find((v) => v.questionId === a.questionId);
        timeline.push({
          type: "answer",
          action: a.action,
          questionId: a.questionId,
          question: a.question,
          response: a.action === "SKIPPED" ? null : a.response,
          isCorrect: a.isCorrect,
          score: a.score,
          pointsEarned: a.pointsEarned,
          xpEarned: a.xpEarned,
          aiGrading: a.aiGrading,
          aiCreditsUsed: a.aiCreditsUsed,
          timeSpentMs: a.timeSpentMs,
          viewedAt: viewEvent?.createdAt || a.createdAt,
          answeredAt: a.createdAt,
        });
      }

      // Add view-only questions (user navigated away without answering)
      for (const q of viewedOnlyQuestions) {
        const viewEvent = viewEvents.find((v) => v.questionId === q.id);
        timeline.push({
          type: "viewed_only",
          action: "VIEWED",
          questionId: q.id,
          question: q,
          response: null,
          isCorrect: null,
          score: null,
          pointsEarned: 0,
          xpEarned: 0,
          aiGrading: null,
          aiCreditsUsed: 0,
          timeSpentMs: null,
          viewedAt: viewEvent?.createdAt || session.startedAt,
          answeredAt: null,
        });
      }

      // Sort by viewedAt
      timeline.sort(
        (a, b) =>
          new Date(a.viewedAt).getTime() - new Date(b.viewedAt).getTime(),
      );

      return {
        session: {
          id: session.id,
          type: session.type,
          status: session.status,
          subject: session.subject,
          questionCount: session.questionCount,
          questionsAnswered: session.questionsAnswered,
          correctAnswers: session.correctAnswers,
          accuracy:
            session.questionsAnswered > 0
              ? Math.round(
                  (session.correctAnswers / session.questionsAnswered) * 100,
                )
              : 0,
          totalXpEarned: session.totalXpEarned,
          totalTimeMs: session.totalTimeMs,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
        },
        timeline,
        stats: {
          totalViewed: timeline.length,
          answered: answers.filter((a) => a.action === "ANSWERED").length,
          skipped: answers.filter((a) => a.action === "SKIPPED").length,
          revealed: answers.filter((a) => a.action === "REVEALED").length,
          viewedOnly: viewedOnlyQuestions.length,
          totalAiCredits: answers.reduce(
            (sum, a) => sum + (a.aiCreditsUsed || 0),
            0,
          ),
          totalXp: answers.reduce((sum, a) => sum + (a.xpEarned || 0), 0),
        },
      };
    },
  );

  // ── Record "Pokaż odpowiedź" (reveal) action ───────────────────────────
  app.post(
    "/:sessionId/reveal",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["questionId"],
          properties: {
            questionId: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const userId = req.user.userId;
      const { sessionId } = req.params as { sessionId: string };
      const { questionId } = req.body as { questionId: string };

      await app.prisma.answer.create({
        data: {
          userId,
          questionId,
          sessionId,
          response: "__REVEALED__",
          action: "REVEALED",
          isCorrect: false,
          score: 0,
          pointsEarned: 0,
          xpEarned: 0,
          aiCreditsUsed: 0,
          timeSpentMs: 0,
        },
      });

      return { ok: true };
    },
  );
};
