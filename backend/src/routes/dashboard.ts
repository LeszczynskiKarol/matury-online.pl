import { FastifyPluginAsync } from 'fastify';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {

  // ── Main dashboard data ──────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user.userId;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [
      user,
      subjectProgress,
      todayGoal,
      weeklyActivity,
      recentSessions,
      dueReviews,
      recentAchievements,
    ] = await Promise.all([
      // User basics
      app.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          name: true,
          totalXp: true,
          globalLevel: true,
          currentStreak: true,
          longestStreak: true,
          subscriptionStatus: true,
          subscriptionEnd: true,
        },
      }),

      // Per-subject progress
      app.prisma.subjectProgress.findMany({
        where: { userId },
        include: {
          subject: { select: { slug: true, name: true, icon: true, color: true } },
        },
      }),

      // Today's daily goal
      app.prisma.dailyGoal.findUnique({
        where: { userId_date: { userId, date: today } },
      }),

      // Last 7 days activity (for chart)
      app.prisma.dailyGoal.findMany({
        where: { userId, date: { gte: weekAgo } },
        orderBy: { date: 'asc' },
      }),

      // Recent sessions
      app.prisma.studySession.findMany({
        where: { userId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 5,
        include: { subject: { select: { slug: true, name: true, icon: true } } },
      }),

      // Due spaced repetition cards
      app.prisma.reviewCard.count({
        where: { userId, nextReviewAt: { lte: now } },
      }),

      // Recent achievements
      app.prisma.userAchievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
        take: 3,
        include: { achievement: true },
      }),
    ]);

    // ── Accuracy trend (last 30 days, grouped by day) ────────────────────
    const monthAnswers = await app.prisma.answer.groupBy({
      by: ['createdAt'],
      where: { userId, createdAt: { gte: monthAgo } },
      _count: true,
      _avg: { score: true },
    });

    // Aggregate by date
    const accuracyByDay: Record<string, { total: number; avgScore: number }> = {};
    const answers30d = await app.prisma.answer.findMany({
      where: { userId, createdAt: { gte: monthAgo } },
      select: { createdAt: true, isCorrect: true, score: true },
    });

    for (const a of answers30d) {
      const dateKey = a.createdAt.toISOString().split('T')[0];
      if (!accuracyByDay[dateKey]) accuracyByDay[dateKey] = { total: 0, avgScore: 0 };
      accuracyByDay[dateKey].total++;
      accuracyByDay[dateKey].avgScore += (a.score ?? 0);
    }

    const accuracyTrend = Object.entries(accuracyByDay)
      .map(([date, data]) => ({
        date,
        questionsAnswered: data.total,
        avgScore: Math.round((data.avgScore / data.total) * 100),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── Topic mastery breakdown ──────────────────────────────────────────
    const topicStats = await app.prisma.answer.groupBy({
      by: ['questionId'],
      where: { userId, createdAt: { gte: monthAgo } },
      _count: true,
      _avg: { score: true },
    });

    return {
      user,
      subjectProgress: subjectProgress.map((sp) => ({
        subject: sp.subject,
        level: sp.level,
        xp: sp.xp,
        questionsAnswered: sp.questionsAnswered,
        accuracy: sp.questionsAnswered > 0
          ? Math.round((sp.correctAnswers / sp.questionsAnswered) * 100)
          : 0,
        adaptiveDifficulty: sp.adaptiveDifficulty,
        topicMastery: sp.topicMastery,
      })),
      today: todayGoal || {
        questionsCompleted: 0,
        xpEarned: 0,
        minutesSpent: 0,
        targetQuestions: 10,
        targetXp: 50,
        targetMinutes: 15,
        isCompleted: false,
      },
      weeklyActivity,
      accuracyTrend,
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        subject: s.subject,
        type: s.type,
        questionsAnswered: s.questionsAnswered,
        accuracy: s.questionsAnswered > 0
          ? Math.round((s.correctAnswers / s.questionsAnswered) * 100)
          : 0,
        xpEarned: s.totalXpEarned,
        completedAt: s.completedAt,
      })),
      dueReviews,
      recentAchievements: recentAchievements.map((ua) => ({
        ...ua.achievement,
        unlockedAt: ua.unlockedAt,
      })),
    };
  });

  // ── Subject-specific dashboard ───────────────────────────────────────────
  app.get('/subject/:slug', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const userId = req.user.userId;

    const subject = await app.prisma.subject.findUnique({ where: { slug } });
    if (!subject) return reply.code(404).send({ error: 'Subject not found' });

    const [progress, topicBreakdown, recentAnswers] = await Promise.all([
      app.prisma.subjectProgress.findUnique({
        where: { userId_subjectId: { userId, subjectId: subject.id } },
      }),

      // Per-topic accuracy
      app.prisma.$queryRaw`
        SELECT
          t.id as "topicId",
          t.name as "topicName",
          t.slug as "topicSlug",
          COUNT(a.id)::int as "totalAnswers",
          COUNT(CASE WHEN a."isCorrect" = true THEN 1 END)::int as "correctAnswers",
          ROUND(AVG(a.score) * 100)::int as "avgScore"
        FROM "Answer" a
        JOIN "Question" q ON a."questionId" = q.id
        JOIN "Topic" t ON q."topicId" = t.id
        WHERE a."userId" = ${userId}
          AND q."subjectId" = ${subject.id}
        GROUP BY t.id, t.name, t.slug
        ORDER BY "totalAnswers" DESC
      `,

      // Recent 20 answers
      app.prisma.answer.findMany({
        where: { userId, question: { subjectId: subject.id } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          isCorrect: true,
          score: true,
          xpEarned: true,
          createdAt: true,
          question: {
            select: { type: true, difficulty: true, topic: { select: { name: true } } },
          },
        },
      }),
    ]);

    return {
      subject: { id: subject.id, slug: subject.slug, name: subject.name },
      progress,
      topicBreakdown,
      recentAnswers,
    };
  });
};
