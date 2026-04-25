import { FastifyPluginAsync } from "fastify";

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.requireAdmin);

  // ── DASHBOARD STATS ────────────────────────────────────────────────────
  app.get("/stats", async () => {
    const [
      totalUsers,
      premiumUsers,
      freeUsers,
      totalQuestions,
      activeQuestions,
      totalAnswers,
      totalEssays,
      totalSessions,
    ] = await Promise.all([
      app.prisma.user.count(),
      app.prisma.user.count({
        where: { subscriptionStatus: { in: ["ACTIVE", "ONE_TIME"] } },
      }),
      app.prisma.user.count({ where: { subscriptionStatus: "FREE" } }),
      app.prisma.question.count(),
      app.prisma.question.count({ where: { isActive: true } }),
      app.prisma.answer.count(),
      app.prisma.essaySubmission.count(),
      app.prisma.studySession.count(),
    ]);
    const activeSubs = await app.prisma.user.count({
      where: { subscriptionStatus: "ACTIVE" },
    });
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentSignups = await app.prisma.user.count({
      where: { createdAt: { gte: weekAgo } },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayAnswers = await app.prisma.answer.count({
      where: { createdAt: { gte: today } },
    });
    const subjects = await app.prisma.subject.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { questions: true, topics: true } } },
    });
    return {
      users: {
        total: totalUsers,
        premium: premiumUsers,
        free: freeUsers,
        recentSignups,
      },
      revenue: { activeSubs, estimatedMRR: activeSubs * 39.99 },
      content: { totalQuestions, activeQuestions },
      activity: { totalAnswers, totalEssays, totalSessions, todayAnswers },
      subjects,
    };
  });

  // ── QUESTIONS ──────────────────────────────────────────────────────────
  app.get("/questions", async (req) => {
    const {
      subjectId,
      topicId,
      type,
      difficulty,
      isActive,
      limit = 50,
      id,

      search,
      offset = 0,
    } = req.query as any;
    const where: any = {};
    if (subjectId) where.subjectId = subjectId;
    if (id) where.id = id;
    if (topicId) where.topicId = topicId;
    if (type) where.type = type;
    if (difficulty) where.difficulty = parseInt(difficulty);
    if (isActive !== undefined) where.isActive = isActive === "true";
    if (search) {
      where.OR = [
        { content: { path: ["question"], string_contains: search } },
        { content: { path: ["prompt"], string_contains: search } },
        { content: { path: ["context"], string_contains: search } },
        { explanation: { contains: search, mode: "insensitive" } },
      ];
    }
    const [questions, total] = await Promise.all([
      app.prisma.question.findMany({
        where,
        include: {
          topic: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, icon: true } },
        },
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      app.prisma.question.count({ where }),
    ]);
    return { questions, total };
  });

  app.get("/questions/:id", async (req, reply) => {
    const q = await app.prisma.question.findUnique({
      where: { id: (req.params as any).id },
      include: { topic: true, subject: true },
    });
    return q || reply.code(404).send({ error: "Not found" });
  });

  app.post("/questions", async (req) => {
    const q = await app.prisma.question.create({ data: req.body as any });
    await app.prisma.topic.update({
      where: { id: q.topicId },
      data: { questionCount: { increment: 1 } },
    });
    return q;
  });

  app.put("/questions/:id", async (req) => {
    const { id } = req.params as any;
    const data = { ...(req.body as any) };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.topic;
    delete data.subject;
    return app.prisma.question.update({ where: { id }, data });
  });

  app.delete("/questions/:id", async (req) => {
    const q = await app.prisma.question.update({
      where: { id: (req.params as any).id },
      data: { isActive: false },
    });
    await app.prisma.topic.update({
      where: { id: q.topicId },
      data: { questionCount: { decrement: 1 } },
    });
    return { ok: true };
  });

  app.post("/questions/:id/restore", async (req) => {
    const q = await app.prisma.question.update({
      where: { id: (req.params as any).id },
      data: { isActive: true },
    });
    await app.prisma.topic.update({
      where: { id: q.topicId },
      data: { questionCount: { increment: 1 } },
    });
    return { ok: true };
  });

  app.post("/questions/bulk", async (req) => {
    const { questions } = req.body as { questions: any[] };
    let created = 0;
    const tc: Record<string, number> = {};
    for (const q of questions) {
      await app.prisma.question.create({ data: q });
      tc[q.topicId] = (tc[q.topicId] || 0) + 1;
      created++;
    }
    for (const [tid, c] of Object.entries(tc)) {
      await app.prisma.topic.update({
        where: { id: tid },
        data: { questionCount: { increment: c } },
      });
    }
    return { created };
  });

  // ── SUBJECTS ───────────────────────────────────────────────────────────
  app.get("/subjects", async () =>
    app.prisma.subject.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { questions: true, topics: true } } },
    }),
  );
  app.post("/subjects", async (req) =>
    app.prisma.subject.create({ data: req.body as any }),
  );
  app.put("/subjects/:id", async (req) => {
    const d = { ...(req.body as any) };
    delete d.id;
    delete d._count;
    return app.prisma.subject.update({
      where: { id: (req.params as any).id },
      data: d,
    });
  });
  app.delete("/subjects/:id", async (req) =>
    app.prisma.subject.update({
      where: { id: (req.params as any).id },
      data: { isActive: false },
    }),
  );

  // ── TOPICS ─────────────────────────────────────────────────────────────
  app.get("/topics", async (req) => {
    const { subjectId } = req.query as any;
    return app.prisma.topic.findMany({
      where: subjectId ? { subjectId } : {},
      include: {
        children: {
          select: {
            id: true,
            name: true,
            slug: true,
            questionCount: true,
            author: true,
          },
        },
        subject: { select: { id: true, name: true } },
      },
      orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
    });
  });
  app.post("/topics", async (req) =>
    app.prisma.topic.create({ data: req.body as any }),
  );
  app.put("/topics/:id", async (req) => {
    const d = { ...(req.body as any) };
    delete d.id;
    delete d.children;
    delete d.subject;
    return app.prisma.topic.update({
      where: { id: (req.params as any).id },
      data: d,
    });
  });
  app.delete("/topics/:id", async (req) =>
    app.prisma.topic.update({
      where: { id: (req.params as any).id },
      data: { isActive: false },
    }),
  );

  // ── USERS ──────────────────────────────────────────────────────────────
  app.get("/users", async (req) => {
    const {
      search,
      status,
      sort = "createdAt",
      order = "desc",
      limit = 50,
      offset = 0,
    } = req.query as any;
    const where: any = {};
    if (status) where.subscriptionStatus = status;
    if (search)
      where.OR = [
        { email: { contains: search } },
        { name: { contains: search } },
      ];
    const [users, total] = await Promise.all([
      app.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          subscriptionStatus: true,
          subscriptionEnd: true,
          totalXp: true,
          globalLevel: true,
          currentStreak: true,
          createdAt: true,
          lastActiveAt: true,
          _count: {
            select: { answers: true, essaySubmissions: true, sessions: true },
          },
        },
        orderBy: { [sort]: order },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      app.prisma.user.count({ where }),
    ]);
    return { users, total };
  });

  app.get("/users/:id", async (req, reply) => {
    const u = await app.prisma.user.findUnique({
      where: { id: (req.params as any).id },
      include: {
        subjectProgress: {
          include: { subject: { select: { name: true, icon: true } } },
        },
        achievements: { include: { achievement: true } },
        _count: {
          select: { answers: true, essaySubmissions: true, sessions: true },
        },
      },
    });
    return u || reply.code(404).send({ error: "Not found" });
  });

  app.put("/users/:id", async (req) => {
    const { role, subscriptionStatus, subscriptionEnd } = req.body as any;
    const data: any = {};
    if (role) data.role = role;
    if (subscriptionStatus) {
      data.subscriptionStatus = subscriptionStatus;
      if (subscriptionStatus === "FREE") data.subscriptionEnd = null;
    }
    if (subscriptionEnd) data.subscriptionEnd = new Date(subscriptionEnd);
    return app.prisma.user.update({
      where: { id: (req.params as any).id },
      data,
    });
  });

  app.post("/users/:id/grant-premium", async (req) => {
    const { days = 30 } = req.body as any;
    const end = new Date();
    end.setDate(end.getDate() + days);
    return app.prisma.user.update({
      where: { id: (req.params as any).id },
      data: { subscriptionStatus: "ONE_TIME", subscriptionEnd: end },
    });
  });

  app.post("/users/:id/revoke-premium", async (req) => {
    return app.prisma.user.update({
      where: { id: (req.params as any).id },
      data: { subscriptionStatus: "FREE", subscriptionEnd: null },
    });
  });

  app.delete("/users/:id", async (req) => {
    await app.prisma.user.delete({ where: { id: (req.params as any).id } });
    return { ok: true };
  });

  // ── ACHIEVEMENTS SEED ──────────────────────────────────────────────────
  app.post("/achievements/seed", async () => {
    const achs = [
      {
        slug: "streak_3",
        name: "Trzydniówka",
        description: "3 dni z rzędu",
        icon: "🔥",
        category: "STREAK" as const,
        conditionType: "streak",
        conditionValue: { threshold: 3 },
        xpReward: 20,
        sortOrder: 1,
      },
      {
        slug: "streak_7",
        name: "Tygodniowy wojownik",
        description: "7 dni z rzędu",
        icon: "🔥",
        category: "STREAK" as const,
        conditionType: "streak",
        conditionValue: { threshold: 7 },
        xpReward: 50,
        sortOrder: 2,
      },
      {
        slug: "streak_30",
        name: "Maratończyk",
        description: "30 dni z rzędu",
        icon: "🏆",
        category: "STREAK" as const,
        conditionType: "streak",
        conditionValue: { threshold: 30 },
        xpReward: 200,
        sortOrder: 3,
      },
      {
        slug: "q_10",
        name: "Pierwsze kroki",
        description: "10 pytań",
        icon: "📝",
        category: "VOLUME" as const,
        conditionType: "questions_answered",
        conditionValue: { threshold: 10 },
        xpReward: 10,
        sortOrder: 10,
      },
      {
        slug: "q_100",
        name: "Setka!",
        description: "100 pytań",
        icon: "💯",
        category: "VOLUME" as const,
        conditionType: "questions_answered",
        conditionValue: { threshold: 100 },
        xpReward: 50,
        sortOrder: 11,
      },
      {
        slug: "q_1000",
        name: "Tysiącznik",
        description: "1000 pytań",
        icon: "🌟",
        category: "VOLUME" as const,
        conditionType: "questions_answered",
        conditionValue: { threshold: 1000 },
        xpReward: 300,
        sortOrder: 13,
      },
    ];
    let c = 0;
    for (const a of achs) {
      await app.prisma.achievement.upsert({
        where: { slug: a.slug },
        update: a,
        create: a,
      });
      c++;
    }
    return { seeded: c };
  });
  app.get(
    "/question-log",
    {
      preHandler: [app.authenticate, app.requireAdmin],
      schema: {
        querystring: {
          type: "object",
          properties: {
            userId: { type: "string" },
            subjectId: { type: "string" },
            limit: { type: "number", default: 100 },
            before: { type: "string" }, // ISO date cursor for "load more"
          },
        },
      },
    },
    async (req) => {
      const { userId, subjectId, limit = 100, before } = req.query as any;

      const where: any = {};
      if (userId) where.userId = userId;
      if (subjectId) where.question = { subjectId };
      if (before) where.createdAt = { lt: new Date(before) };

      const answers = await app.prisma.answer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          questionId: true,
          sessionId: true,
          isCorrect: true,
          score: true,
          xpEarned: true,
          timeSpentMs: true,
          response: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          session: {
            select: {
              id: true,
              type: true,
              subjectId: true,
              startedAt: true,
              subject: { select: { name: true, icon: true, slug: true } },
            },
          },
          question: {
            select: {
              id: true,
              type: true,
              difficulty: true,
              points: true,
              source: true,
              content: true,
              topic: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });

      const hasMore = answers.length === limit;

      // ── Dociągnij viewCount z QuestionView dla tego usera ──────────
      let viewCountMap: Record<string, number> = {};
      if (userId && answers.length > 0) {
        const qIds = [...new Set(answers.map((a: any) => a.questionId))];
        const views = await app.prisma.questionView.findMany({
          where: { userId, questionId: { in: qIds } },
          select: { questionId: true, viewCount: true },
        });
        for (const v of views) {
          viewCountMap[v.questionId] = v.viewCount;
        }
      }

      return {
        answers: answers.map((a: any) => ({
          ...a,
          viewCount: viewCountMap[a.questionId] || null,
        })),
        hasMore,
      };
    },
  );

  app.get(
    "/question-view-log",
    {
      preHandler: [app.authenticate, app.requireAdmin],
      schema: {
        querystring: {
          type: "object",
          properties: {
            userId: { type: "string" },
            subjectId: { type: "string" },
            limit: { type: "number", default: 150 },
            before: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { userId, subjectId, limit = 150, before } = req.query as any;

      const where: any = {};
      if (userId) where.userId = userId;
      if (subjectId) where.question = { subjectId };
      if (before) where.createdAt = { lt: new Date(before) };

      const events = await app.prisma.questionViewEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          questionId: true,
          sessionId: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          question: {
            select: {
              id: true,
              type: true,
              difficulty: true,
              points: true,
              source: true,
              content: true,
              topic: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });

      // Dociągnij viewCount per user+question dla wyświetlonych pytań
      let viewCounts: Record<string, number> = {};
      if (userId && events.length > 0) {
        const qIds = [...new Set(events.map((e: any) => e.questionId))];
        const views = await app.prisma.questionView.findMany({
          where: { userId, questionId: { in: qIds } },
          select: { questionId: true, viewCount: true },
        });
        for (const v of views) {
          viewCounts[v.questionId] = v.viewCount;
        }
      }

      // Dociągnij info czy user odpowiedział na to pytanie
      let answerMap: Record<
        string,
        { isCorrect: boolean | null; response: any }
      > = {};
      if (userId && events.length > 0) {
        const qIds = [...new Set(events.map((e: any) => e.questionId))];
        const answers = await app.prisma.answer.findMany({
          where: { userId, questionId: { in: qIds } },
          select: { questionId: true, isCorrect: true, response: true },
          orderBy: { createdAt: "desc" },
        });
        // Ostatnia odpowiedź per question
        for (const a of answers) {
          if (!answerMap[a.questionId]) {
            answerMap[a.questionId] = {
              isCorrect: a.isCorrect,
              response: a.response,
            };
          }
        }
      }

      return {
        events: events.map((e: any) => ({
          ...e,
          totalViewCount: viewCounts[e.questionId] || null,
          answer: answerMap[e.questionId] || null,
        })),
        hasMore: events.length === limit,
      };
    },
  );
};
