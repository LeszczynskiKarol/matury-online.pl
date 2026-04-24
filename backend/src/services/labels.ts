// ============================================================================
// Dynamic Labels — computed on-the-fly, no persistence
// Labels appear/disappear based on current user state
// ============================================================================

import { PrismaClient } from "@prisma/client";

export interface Label {
  id: string;
  text: string;
  color: string; // hex
  category: "streak" | "ranking" | "activity" | "premium";
}

// ── All possible labels ────────────────────────────────────────────────────

const LABEL_DEFS: {
  id: string;
  text: string;
  color: string;
  category: Label["category"];
  check: (ctx: UserContext) => boolean;
}[] = [
  // Streak
  {
    id: "streak_3",
    text: "🔥 Seria 3 dni",
    color: "#f97316",
    category: "streak",
    check: (c) => c.streak >= 3 && c.streak < 7,
  },
  {
    id: "streak_7",
    text: "🔥 Seria 7 dni",
    color: "#ef4444",
    category: "streak",
    check: (c) => c.streak >= 7 && c.streak < 30,
  },
  {
    id: "streak_30",
    text: "🔥🔥 Seria 30 dni",
    color: "#dc2626",
    category: "streak",
    check: (c) => c.streak >= 30 && c.streak < 100,
  },
  {
    id: "streak_100",
    text: "🌋 Seria 100 dni",
    color: "#b91c1c",
    category: "streak",
    check: (c) => c.streak >= 100,
  },

  // Ranking
  {
    id: "top_10",
    text: "🏆 Top 10",
    color: "#f59e0b",
    category: "ranking",
    check: (c) => c.globalRank !== null && c.globalRank <= 10,
  },
  {
    id: "top_1",
    text: "🥇 #1",
    color: "#eab308",
    category: "ranking",
    check: (c) => c.globalRank === 1,
  },

  // Activity
  {
    id: "perfectionist",
    text: "💯 Perfekcjonista",
    color: "#8b5cf6",
    category: "activity",
    check: (c) => c.recentPerfectSessions >= 5,
  },
  {
    id: "speed_demon",
    text: "⚡ Szybki Bill",
    color: "#06b6d4",
    category: "activity",
    check: (c) => c.avgResponseTimeMs !== null && c.avgResponseTimeMs < 15000,
  },
  {
    id: "polymath",
    text: "📚 Polihistor",
    color: "#3b82f6",
    category: "activity",
    check: (c) => c.activeSubjectsThisWeek >= 3,
  },
  {
    id: "night_owl",
    text: "🦉 Nocna Sowa",
    color: "#6366f1",
    category: "activity",
    check: (c) => c.lastSessionHour !== null && c.lastSessionHour >= 23,
  },
  {
    id: "early_bird",
    text: "🐦 Ranny Ptaszek",
    color: "#14b8a6",
    category: "activity",
    check: (c) => c.lastSessionHour !== null && c.lastSessionHour < 6,
  },

  // Premium / special
  {
    id: "premium",
    text: "👑 Premium",
    color: "#ec4899",
    category: "premium",
    check: (c) =>
      c.subscriptionStatus === "ACTIVE" || c.subscriptionStatus === "ONE_TIME",
  },
];

// ── Context gathered once, fed into all label checks ───────────────────────

interface UserContext {
  streak: number;
  globalRank: number | null;
  recentPerfectSessions: number; // last 10 sessions with 100%
  avgResponseTimeMs: number | null; // avg of last 50 answers
  activeSubjectsThisWeek: number;
  lastSessionHour: number | null; // 0-23
  subscriptionStatus: string;
}

export async function computeLabels(
  prisma: PrismaClient,
  userId: string,
): Promise<Label[]> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Gather all context in parallel
  const [user, globalRank, recentSessions, recentAnswers, weekSubjects] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          currentStreak: true,
          subscriptionStatus: true,
          totalXp: true,
        },
      }),

      // Global rank
      prisma.user
        .count({ where: { totalXp: { gt: 0 } } })
        .then(async (total) => {
          if (total === 0) return null;
          const above = await prisma.user.count({
            where: {
              totalXp: {
                gt: (
                  await prisma.user.findUniqueOrThrow({
                    where: { id: userId },
                    select: { totalXp: true },
                  })
                ).totalXp,
              },
            },
          });
          return above + 1;
        }),

      // Last 10 completed sessions
      prisma.studySession.findMany({
        where: { userId, status: "COMPLETED", questionsAnswered: { gt: 0 } },
        orderBy: { completedAt: "desc" },
        take: 10,
        select: {
          correctAnswers: true,
          questionsAnswered: true,
          completedAt: true,
        },
      }),

      // Last 50 answers avg time
      prisma.answer.findMany({
        where: { userId, timeSpentMs: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { timeSpentMs: true },
      }),

      // Distinct subjects this week
      prisma.studySession
        .findMany({
          where: { userId, startedAt: { gte: weekAgo } },
          select: { subjectId: true },
          distinct: ["subjectId"],
        })
        .then((rows) => rows.length),
    ]);

  const perfectCount = recentSessions.filter(
    (s) => s.questionsAnswered > 0 && s.correctAnswers === s.questionsAnswered,
  ).length;

  const avgTime =
    recentAnswers.length > 0
      ? recentAnswers.reduce((sum, a) => sum + (a.timeSpentMs || 0), 0) /
        recentAnswers.length
      : null;

  const lastHour =
    recentSessions.length > 0 && recentSessions[0].completedAt
      ? recentSessions[0].completedAt.getHours()
      : null;

  const ctx: UserContext = {
    streak: user.currentStreak,
    globalRank: globalRank,
    recentPerfectSessions: perfectCount,
    avgResponseTimeMs: avgTime,
    activeSubjectsThisWeek: weekSubjects,
    lastSessionHour: lastHour,
    subscriptionStatus: user.subscriptionStatus,
  };

  // Evaluate all labels
  const active: Label[] = [];
  for (const def of LABEL_DEFS) {
    if (def.check(ctx)) {
      active.push({
        id: def.id,
        text: def.text,
        color: def.color,
        category: def.category,
      });
    }
  }

  // Only show highest streak label (they're mutually exclusive already via ranges)
  // Only show top_1 if both top_1 and top_10 match
  if (active.find((l) => l.id === "top_1")) {
    const idx = active.findIndex((l) => l.id === "top_10");
    if (idx !== -1) active.splice(idx, 1);
  }

  return active;
}

// Export definitions for frontend "all labels" view
export function getAllLabelDefinitions() {
  return LABEL_DEFS.map((d) => ({
    id: d.id,
    text: d.text,
    color: d.color,
    category: d.category,
  }));
}
