// ============================================================================
// Gamification Routes — badges, labels, titles, leaderboard, streak
// ============================================================================

import { FastifyPluginAsync } from "fastify";
import { getXpToNextLevel } from "../services/gamification.js";
import { getUserBadges } from "../services/badges.js";
import { computeLabels, getAllLabelDefinitions } from "../services/labels.js";
import {
  getTitleForLevel,
  getNextTitle,
  getAllTitlesWithStatus,
  TITLES,
} from "../services/titles.js";

const SUBJECT_THRESHOLDS = [0, 100, 350, 800, 1500];
const GLOBAL_THRESHOLDS = [
  0, 200, 600, 1500, 3000, 5000, 8000, 12000, 18000, 25000,
];

export const gamificationRoutes: FastifyPluginAsync = async (app) => {
  // ── Badges (replaces old achievements endpoint) ────────────────────────
  app.get("/badges", { preHandler: [app.authenticate] }, async (req) => {
    return getUserBadges(app.prisma, req.user.userId);
  });

  // ── Legacy achievements alias → same as badges ─────────────────────────
  app.get("/achievements", { preHandler: [app.authenticate] }, async (req) => {
    return getUserBadges(app.prisma, req.user.userId);
  });

  // ── Labels (dynamic, computed on-the-fly) ──────────────────────────────
  app.get("/labels", { preHandler: [app.authenticate] }, async (req) => {
    const active = await computeLabels(app.prisma, req.user.userId);
    const all = getAllLabelDefinitions();
    return {
      active,
      all: all.map((def) => ({
        ...def,
        isActive: active.some((a) => a.id === def.id),
      })),
    };
  });

  // ── Title info ─────────────────────────────────────────────────────────
  app.get("/title", { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: { globalLevel: true, totalXp: true, activeTitle: true },
    });

    const current = getTitleForLevel(user.globalLevel);
    const next = getNextTitle(user.globalLevel);
    const allTitles = getAllTitlesWithStatus(user.globalLevel);

    return {
      current,
      next,
      globalLevel: user.globalLevel,
      totalXp: user.totalXp,
      allTitles,
    };
  });

  // ── Showcase badges (set up to 3 pinned badges on profile) ─────────────
  app.post(
    "/showcase",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { badgeIds } = req.body as { badgeIds: string[] };

      if (!Array.isArray(badgeIds) || badgeIds.length > 3) {
        return reply
          .code(400)
          .send({ error: "Maksymalnie 3 odznaki w showcase" });
      }

      // Verify user actually earned these badges
      if (badgeIds.length > 0) {
        const earned = await app.prisma.userAchievement.findMany({
          where: {
            userId: req.user.userId,
            achievementId: { in: badgeIds },
          },
        });
        if (earned.length !== badgeIds.length) {
          return reply.code(400).send({
            error: "Nie posiadasz jednej lub więcej wybranych odznak",
          });
        }
      }

      await app.prisma.user.update({
        where: { id: req.user.userId },
        data: { showcaseBadgeIds: badgeIds },
      });

      return { ok: true, showcaseBadgeIds: badgeIds };
    },
  );

  // ── Full profile card (for leaderboard / public profile) ───────────────
  app.get("/profile", { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        totalXp: true,
        globalLevel: true,
        currentStreak: true,
        longestStreak: true,
        activeTitle: true,
        showcaseBadgeIds: true,
      },
    });

    const [labels, title] = await Promise.all([
      computeLabels(app.prisma, req.user.userId),
      Promise.resolve(getTitleForLevel(user.globalLevel)),
    ]);

    // Fetch showcase badge details
    const showcaseIds = (user.showcaseBadgeIds as string[]) || [];
    let showcaseBadges: any[] = [];
    if (showcaseIds.length > 0) {
      const badges = await app.prisma.achievement.findMany({
        where: { id: { in: showcaseIds } },
        select: { id: true, slug: true, name: true, icon: true, tier: true },
      });
      // Maintain order
      showcaseBadges = showcaseIds
        .map((id) => badges.find((b) => b.id === id))
        .filter(Boolean);
    }

    return {
      ...user,
      title,
      labels,
      showcaseBadges,
    };
  });

  // ── Level info ─────────────────────────────────────────────────────────
  app.get("/level", { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: { totalXp: true, globalLevel: true },
    });

    const subjects = await app.prisma.subjectProgress.findMany({
      where: { userId: req.user.userId },
      include: {
        subject: { select: { slug: true, name: true, icon: true } },
      },
    });

    const title = getTitleForLevel(user.globalLevel);
    const nextTitle = getNextTitle(user.globalLevel);

    return {
      global: {
        level: user.globalLevel,
        totalXp: user.totalXp,
        title,
        nextTitle,
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

  // ── Leaderboard (enhanced with titles & labels) ────────────────────────
  app.get("/leaderboard", async (req) => {
    const { subjectId } = req.query as any;

    if (subjectId) {
      const top = await app.prisma.subjectProgress.findMany({
        where: { subjectId },
        orderBy: { xp: "desc" },
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              globalLevel: true,
              activeTitle: true,
              currentStreak: true,
            },
          },
        },
      });
      return top.map((sp, i) => ({
        rank: i + 1,
        user: {
          ...sp.user,
          title: getTitleForLevel(sp.user.globalLevel),
        },
        xp: sp.xp,
        level: sp.level,
      }));
    }

    const top = await app.prisma.user.findMany({
      orderBy: { totalXp: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        totalXp: true,
        globalLevel: true,
        activeTitle: true,
        currentStreak: true,
        showcaseBadgeIds: true,
      },
    });

    return top.map((u, i) => ({
      rank: i + 1,
      ...u,
      title: getTitleForLevel(u.globalLevel),
    }));
  });

  // ── Streak info ────────────────────────────────────────────────────────
  app.get("/streak", { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: {
        currentStreak: true,
        longestStreak: true,
        lastActiveAt: true,
      },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const goals = await app.prisma.dailyGoal.findMany({
      where: { userId: req.user.userId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        questionsCompleted: true,
        xpEarned: true,
        isCompleted: true,
      },
    });

    return { ...user, recentActivity: goals };
  });
};
