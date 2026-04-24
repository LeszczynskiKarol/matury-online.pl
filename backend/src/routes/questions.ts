import { FastifyPluginAsync } from "fastify";
import { selectSmartQuestions } from "../services/smart-question-selector.js";

export const questionRoutes: FastifyPluginAsync = async (app) => {
  // Get questions with filtering (supports single AND multi values)
  app.get(
    "/",
    {
      preHandler: [app.optionalAuth],
      schema: {
        querystring: {
          type: "object",
          required: ["subjectId"],
          properties: {
            subjectId: { type: "string" },
            topicId: { type: "string" },
            topicIds: { type: "string" }, // comma-separated
            type: { type: "string" },
            types: { type: "string" }, // comma-separated
            difficulty: { type: "number" },
            difficulties: { type: "string" }, // comma-separated "1,3,5"
            sources: { type: "string" }, // comma-separated "PP,PR"
            exclude: { type: "string" }, // comma-separated IDs to skip
            shuffle: { type: "boolean" }, // randomize order
            sort: { type: "string" },
            limit: { type: "number", default: 10 },
            offset: { type: "number", default: 0 },
          },
        },
      },
    },
    async (req) => {
      const {
        subjectId,
        topicId,
        topicIds,
        type,
        types,
        difficulty,
        difficulties,
        sources,
        sort,
        exclude,
        shuffle,
        limit,
        offset,
      } = req.query as any;

      const topicIdArr = topicIds
        ? topicIds.split(",").filter(Boolean)
        : topicId
          ? [topicId]
          : [];
      const typeArr = types
        ? types.split(",").filter(Boolean)
        : type
          ? [type]
          : [];
      const diffArr = difficulties
        ? difficulties
            .split(",")
            .map(Number)
            .filter((n: number) => n >= 1 && n <= 5)
        : difficulty
          ? [difficulty]
          : [];
      const sourceArr = sources ? sources.split(",").filter(Boolean) : [];
      const excludeIds = exclude ? exclude.split(",").filter(Boolean) : [];

      const where: any = { subjectId, isActive: true };
      if (topicIdArr.length > 0) where.topicId = { in: topicIdArr };
      if (typeArr.length > 0) where.type = { in: typeArr };
      if (diffArr.length > 0) where.difficulty = { in: diffArr };
      if (sourceArr.length > 0) where.source = { in: sourceArr };
      if (excludeIds.length > 0) where.id = { notIn: excludeIds };

      const total = await app.prisma.question.count({ where });
      // ── ADMIN DETERMINISTIC BROWSE ─────────────────────────────────────
      if (sort && !shuffle) {
        const rawQuestions = await app.prisma.question.findMany({
          where,
          select: {
            id: true,
            type: true,
            difficulty: true,
            points: true,
            content: true,
            source: true,
            totalAttempts: true,
            createdAt: true,
            topic: {
              select: { id: true, name: true, slug: true, sortOrder: true },
            },
          },
          orderBy:
            sort === "newest"
              ? { createdAt: "desc" }
              : sort === "oldest"
                ? { createdAt: "asc" }
                : { createdAt: "desc" },
          take: limit,
          skip: offset,
        });

        let sorted = rawQuestions;
        if (sort === "az") {
          sorted = [...rawQuestions].sort((a: any, b: any) => {
            const d = a.topic.sortOrder - b.topic.sortOrder;
            if (d !== 0) return d;
            return ((a.content as any)?.question || "").localeCompare(
              (b.content as any)?.question || "",
              "pl",
            );
          });
        } else if (sort === "za") {
          sorted = [...rawQuestions].sort((a: any, b: any) => {
            const d = b.topic.sortOrder - a.topic.sortOrder;
            if (d !== 0) return d;
            return ((b.content as any)?.question || "").localeCompare(
              (a.content as any)?.question || "",
              "pl",
            );
          });
        }

        // ── Policz ile razy BIEŻĄCY USER widział każde pytanie ──────────
        const userId = req.user?.userId;
        let viewCounts: Record<string, number> = {};
        if (userId && sorted.length > 0) {
          const counts = await app.prisma.answer.groupBy({
            by: ["questionId"],
            where: {
              userId,
              questionId: { in: sorted.map((q: any) => q.id) },
            },
            _count: { id: true },
          });
          for (const c of counts) {
            viewCounts[c.questionId] = c._count.id;
          }
        }

        return {
          questions: sorted.map((q: any) => ({
            ...q,
            myViewCount: viewCounts[q.id] || 0,
          })),
          total,
        };
      }

      if (shuffle) {
        // Auto-generate LISTENING if pool empty
        if (typeArr.includes("LISTENING")) {
          const listeningCount = await app.prisma.question.count({
            where: { ...where, type: "LISTENING" },
          });
          if (listeningCount === 0) {
            const { getNextListeningQuestion } =
              await import("../services/listening-session.service.js");
            const { ensureListeningTopic } =
              await import("../services/listening-topic.js");
            const ltopic = await ensureListeningTopic(app.prisma, subjectId);
            if (!ltopic) {
              return { questions: [], total: 0 };
            }
            const diff = diffArr.length > 0 ? diffArr[0] : 2;
            const generated = await getNextListeningQuestion(app.prisma, {
              sessionId: `auto_${Date.now()}`,
              subjectId,
              topicId: ltopic.id,
              difficulty: diff,
              userId: req.user?.userId || "anon",
            });
            const q = await app.prisma.question.findUnique({
              where: { id: generated.questionId },
              select: {
                id: true,
                type: true,
                difficulty: true,
                points: true,
                content: true,
                source: true,
                topic: { select: { id: true, name: true, slug: true } },
              },
            });
            if (q) return { questions: [q], total: 1 };
          }
        }

        // ── SMART SELECTION (replaces dumb shuffle) ─────────────────────
        const result = await selectSmartQuestions(app.prisma, {
          userId: req.user?.userId || "anon",
          subjectId,
          topicId: topicIdArr.length === 1 ? topicIdArr[0] : undefined,
          topicIds: topicIdArr.length > 1 ? topicIdArr : undefined,
          types: typeArr.length > 0 ? typeArr : undefined,
          difficulties: diffArr.length > 0 ? diffArr : undefined,
          sources: sourceArr.length > 0 ? sourceArr : undefined,
          exclude: excludeIds,
          count: limit || 10,
          context: "POOL",
        });

        return { questions: result.questions, total: result.total };
      }

      const questions = await app.prisma.question.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          difficulty: true,
          points: true,
          content: true,
          source: true,
          topic: { select: { id: true, name: true, slug: true } },
          totalAttempts: true,
          correctCount: true,
        },
      });
      // ── Auto-generate LISTENING if pool is empty ──────────────────────
      if (typeArr.includes("LISTENING") && questions.length === 0) {
        const { getNextListeningQuestion } =
          await import("../services/listening-session.service.js");

        let topic = await app.prisma.topic.findFirst({
          where: { subjectId, slug: "sluchanie" },
        });
        if (!topic) {
          topic = await app.prisma.topic.create({
            data: {
              subjectId,
              slug: "sluchanie",
              name: "XIV. Rozumienie ze słuchu",
              sortOrder: 14,
              depth: 0,
              isActive: true,
            },
          });
        }

        const diff = diffArr.length > 0 ? diffArr[0] : 2;
        const generated = await getNextListeningQuestion(app.prisma, {
          sessionId: `auto_${Date.now()}`,
          subjectId,
          topicId: topic.id,
          difficulty: diff,
          userId: req.user?.userId || "anon",
        });

        const q = await app.prisma.question.findUnique({
          where: { id: generated.questionId },
          select: {
            id: true,
            type: true,
            difficulty: true,
            points: true,
            content: true,
            source: true,
            topic: { select: { id: true, name: true, slug: true } },
          },
        });

        if (q) return { questions: [q], total: 1 };
      }
      return { questions, total };
    },
  );

  // Filter options — what's available for a subject
  app.get(
    "/filter-options",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["subjectId"],
          properties: { subjectId: { type: "string" } },
        },
      },
    },
    async (req) => {
      const { subjectId } = req.query as any;

      const [
        topics,
        typeCounts,
        difficultyCounts,
        sourceCounts,
        totalQuestions,
      ] = await Promise.all([
        app.prisma.topic.findMany({
          where: { subjectId, isActive: true, questionCount: { gt: 0 } },
          select: {
            id: true,
            name: true,
            slug: true,
            questionCount: true,
            depth: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: "asc" },
        }),
        app.prisma.$queryRaw`
        SELECT type, COUNT(*)::int as count FROM "Question"
        WHERE "subjectId" = ${subjectId} AND "isActive" = true
        GROUP BY type ORDER BY count DESC
      ` as Promise<{ type: string; count: number }[]>,
        app.prisma.$queryRaw`
        SELECT difficulty, COUNT(*)::int as count FROM "Question"
        WHERE "subjectId" = ${subjectId} AND "isActive" = true
        GROUP BY difficulty ORDER BY difficulty
      ` as Promise<{ difficulty: number; count: number }[]>,
        app.prisma.$queryRaw`
        SELECT source, COUNT(*)::int as count FROM "Question"
        WHERE "subjectId" = ${subjectId} AND "isActive" = true AND source IS NOT NULL
        GROUP BY source ORDER BY count DESC
      ` as Promise<{ source: string; count: number }[]>,
        app.prisma.question.count({ where: { subjectId, isActive: true } }),
      ]);

      // Always show LISTENING for English (generated live, may have 0 in DB)
      const subjectForFilter = await app.prisma.subject.findUnique({
        where: { id: subjectId },
      });
      if (
        subjectForFilter?.slug === "angielski" &&
        !typeCounts.some((t: any) => t.type === "LISTENING")
      ) {
        typeCounts.push({ type: "LISTENING", count: 0 });
      }

      return {
        topics,
        types: typeCounts,
        difficulties: difficultyCounts,
        sources: sourceCounts,
        totalQuestions,
      };
    },
  );

  // Get single question
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = await app.prisma.question.findUnique({
      where: { id },
      include: {
        topic: { select: { id: true, name: true, slug: true, parentId: true } },
      },
    });
    if (!q) return reply.code(404).send({ error: "Question not found" });
    return q;
  });

  // Record a skip — so smart selector knows this question was shown
  app.post(
    "/:id/skip",
    {
      preHandler: [app.authenticate],
    },
    async (req) => {
      const userId = req.user.userId;
      const { id } = req.params as { id: string };
      const { sessionId } = (req.body as any) || {};

      const question = await app.prisma.question.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!question) return { ok: false };

      // Record as Answer with __SKIPPED__ marker
      // Smart selector reads Answer history → will deprioritize
      await app.prisma.answer.create({
        data: {
          userId,
          questionId: id,
          ...(sessionId ? { sessionId } : {}),
          response: "__SKIPPED__",
          isCorrect: null,
          score: 0,
          pointsEarned: 0,
          xpEarned: 0,
          timeSpentMs: 0,
        },
      });

      return { ok: true };
    },
  );
};
