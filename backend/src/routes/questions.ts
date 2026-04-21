import { FastifyPluginAsync } from "fastify";

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
              // Subject doesn't support listening — return empty result
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

        // Oversample + shuffle for randomness
        const all = await app.prisma.question.findMany({
          where,
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
          take: Math.min((limit || 10) * 3, 150),
          orderBy: { totalAttempts: "asc" },
        });
        const shuffled = all.sort(() => Math.random() - 0.5);
        return { questions: shuffled.slice(0, limit || 10), total };
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
};
