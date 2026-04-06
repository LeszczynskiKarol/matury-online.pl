import { FastifyPluginAsync } from 'fastify';
import { getXpToNextLevel } from '../services/gamification.js';

const SUBJECT_THRESHOLDS = [0, 100, 350, 800, 1500];
const GLOBAL_THRESHOLDS = [0, 200, 600, 1500, 3000, 5000, 8000, 12000, 18000, 25000];

export const gamificationRoutes: FastifyPluginAsync = async (app) => {

  // User's achievements
  app.get('/achievements', { preHandler: [app.authenticate] }, async (req) => {
    const earned = await app.prisma.userAchievement.findMany({
      where: { userId: req.user.userId },
      include: { achievement: true },
      orderBy: { unlockedAt: 'desc' },
    });

    const all = await app.prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const earnedIds = new Set(earned.map((e) => e.achievementId));

    return {
      earned: earned.map((e) => ({ ...e.achievement, unlockedAt: e.unlockedAt })),
      locked: all.filter((a) => !earnedIds.has(a.id)).map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
      })),
    };
  });

  // Level info
  app.get('/level', { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: { totalXp: true, globalLevel: true },
    });

    const subjects = await app.prisma.subjectProgress.findMany({
      where: { userId: req.user.userId },
      include: { subject: { select: { slug: true, name: true, icon: true } } },
    });

    return {
      global: {
        level: user.globalLevel,
        totalXp: user.totalXp,
        ...getXpToNextLevel(user.totalXp, GLOBAL_THRESHOLDS),
      },
      subjects: subjects.map((sp) => ({
        subject: sp.subject,
        level: sp.level,
        xp: sp.xp,
        ...getXpToNextLevel(sp.xp, SUBJECT_THRESHOLDS),
      })),
    };
  });

  // Leaderboard (top 50 by XP)
  app.get('/leaderboard', async (req) => {
    const { subjectId } = req.query as any;

    if (subjectId) {
      const top = await app.prisma.subjectProgress.findMany({
        where: { subjectId },
        orderBy: { xp: 'desc' },
        take: 50,
        include: { user: { select: { id: true, name: true, avatarUrl: true, globalLevel: true } } },
      });
      return top.map((sp, i) => ({
        rank: i + 1,
        user: sp.user,
        xp: sp.xp,
        level: sp.level,
      }));
    }

    const top = await app.prisma.user.findMany({
      orderBy: { totalXp: 'desc' },
      take: 50,
      select: { id: true, name: true, avatarUrl: true, totalXp: true, globalLevel: true },
    });
    return top.map((u, i) => ({ rank: i + 1, ...u }));
  });

  // Streak info
  app.get('/streak', { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: { currentStreak: true, longestStreak: true, lastActiveAt: true },
    });

    // Get last 30 days activity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const goals = await app.prisma.dailyGoal.findMany({
      where: { userId: req.user.userId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'asc' },
      select: { date: true, questionsCompleted: true, xpEarned: true, isCompleted: true },
    });

    return { ...user, recentActivity: goals };
  });
};
