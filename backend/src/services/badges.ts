// ============================================================================
// Badge Checker — enhanced checkAchievements with progress tracking
// Replaces the basic checkAchievements in gamification.ts
// ============================================================================

import { PrismaClient } from "@prisma/client";

interface BadgeProgress {
  current: number;
  target: number;
}

// Compute current progress value for a given progressType
async function getProgress(
  prisma: PrismaClient,
  userId: string,
  progressType: string,
): Promise<number> {
  switch (progressType) {
    case "streak": {
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { currentStreak: true },
      });
      return u.currentStreak;
    }

    case "total_questions": {
      const sps = await prisma.subjectProgress.findMany({
        where: { userId },
        select: { questionsAnswered: true },
      });
      return sps.reduce((s, sp) => s + sp.questionsAnswered, 0);
    }

    case "total_xp": {
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { totalXp: true },
      });
      return u.totalXp;
    }

    case "perfect_sessions": {
      const sessions = await prisma.studySession.findMany({
        where: {
          userId,
          status: "COMPLETED",
          questionsAnswered: { gt: 0 },
        },
        select: { correctAnswers: true, questionsAnswered: true },
      });
      return sessions.filter((s) => s.correctAnswers === s.questionsAnswered)
        .length;
    }

    case "essays_written": {
      return prisma.essaySubmission.count({ where: { userId } });
    }

    case "max_subject_level": {
      const sps = await prisma.subjectProgress.findMany({
        where: { userId },
        select: { level: true },
      });
      return sps.length > 0 ? Math.max(...sps.map((sp) => sp.level)) : 0;
    }

    case "subjects_at_level_3": {
      const sps = await prisma.subjectProgress.findMany({
        where: { userId, level: { gte: 3 } },
      });
      return sps.length;
    }

    case "active_subjects": {
      const sps = await prisma.subjectProgress.findMany({
        where: { userId, questionsAnswered: { gt: 0 } },
      });
      return sps.length;
    }

    default:
      return 0;
  }
}

// ── Check and award badges ─────────────────────────────────────────────────

export async function checkBadges(
  prisma: PrismaClient,
  userId: string,
  context?: {
    sessionCompletedAt?: Date; // for time-based badges
    sessionCorrect?: number;
    sessionTotal?: number;
    fastAnswers?: number; // answers < 30s in session
    previousLastActiveAt?: Date | null; // for comeback detection
  },
): Promise<{
  unlocked: {
    slug: string;
    name: string;
    icon: string;
    xpReward: number;
    tier: string;
  }[];
}> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      achievements: { select: { achievementId: true } },
      subjectProgress: true,
    },
  });

  const earnedIds = new Set(user.achievements.map((a) => a.achievementId));
  const allBadges = await prisma.achievement.findMany({
    where: { isActive: true },
  });

  const unlocked: {
    slug: string;
    name: string;
    icon: string;
    xpReward: number;
    tier: string;
  }[] = [];

  for (const badge of allBadges) {
    if (earnedIds.has(badge.id)) continue;

    const val = badge.conditionValue as Record<string, any>;
    let earned = false;

    switch (badge.conditionType) {
      case "streak":
        earned = user.currentStreak >= (val.threshold || 0);
        break;

      case "total_xp":
        earned = user.totalXp >= (val.threshold || 0);
        break;

      case "questions_answered": {
        const total = user.subjectProgress.reduce(
          (s, sp) => s + sp.questionsAnswered,
          0,
        );
        earned = total >= (val.threshold || 0);
        break;
      }

      case "global_level":
        earned = user.globalLevel >= (val.threshold || 0);
        break;

      case "subject_level":
        earned = user.subjectProgress.some(
          (sp) =>
            sp.level >= (val.level || 0) &&
            (!val.subjectId || sp.subjectId === val.subjectId),
        );
        break;

      case "multi_subject_level":
        earned =
          user.subjectProgress.filter((sp) => sp.level >= (val.level || 0))
            .length >= (val.count || 0);
        break;

      case "all_subjects_active": {
        const totalSubjects = await prisma.subject.count({
          where: { isActive: true },
        });
        const activeCount = user.subjectProgress.filter(
          (sp) => sp.questionsAnswered > 0,
        ).length;
        earned = activeCount >= totalSubjects && totalSubjects > 0;
        break;
      }

      case "perfect_sessions": {
        const sessions = await prisma.studySession.findMany({
          where: {
            userId,
            status: "COMPLETED",
            questionsAnswered: { gt: 0 },
          },
          select: { correctAnswers: true, questionsAnswered: true },
        });
        const perfectCount = sessions.filter(
          (s) => s.correctAnswers === s.questionsAnswered,
        ).length;
        earned = perfectCount >= (val.threshold || 0);
        break;
      }

      case "essays_written": {
        const count = await prisma.essaySubmission.count({
          where: { userId },
        });
        earned = count >= (val.threshold || 0);
        break;
      }

      case "session_hour": {
        if (context?.sessionCompletedAt) {
          const hour = context.sessionCompletedAt.getHours();
          earned = hour >= (val.minHour || 0) && hour < (val.maxHour || 24);
        }
        break;
      }

      case "comeback": {
        if (context?.previousLastActiveAt) {
          const daysSince = Math.floor(
            (Date.now() - context.previousLastActiveAt.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          earned = daysSince >= (val.daysAway || 7);
        }
        break;
      }

      case "speed_run": {
        if (
          context?.fastAnswers !== undefined &&
          context?.sessionCorrect !== undefined
        ) {
          earned =
            context.fastAnswers >= (val.correct || 10) &&
            context.sessionCorrect >= (val.correct || 10);
        }
        break;
      }

      case "manual":
        // Only awarded via admin
        break;
    }

    if (earned) {
      await prisma.userAchievement.create({
        data: { userId, achievementId: badge.id },
      });

      if (badge.xpReward > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { totalXp: { increment: badge.xpReward } },
        });
      }

      unlocked.push({
        slug: badge.slug,
        name: badge.name,
        icon: badge.icon,
        xpReward: badge.xpReward,
        tier: (badge as any).tier || "BRONZE",
      });
    }
  }

  return { unlocked };
}

// ── Get all badges with progress for a user ────────────────────────────────

export async function getUserBadges(
  prisma: PrismaClient,
  userId: string,
): Promise<{
  earned: any[];
  locked: any[];
  stats: { total: number; earned: number; byTier: Record<string, number> };
}> {
  const [userAchievements, allBadges] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: { unlockedAt: "desc" },
    }),
    prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const earnedMap = new Map(
    userAchievements.map((ua) => [ua.achievementId, ua.unlockedAt]),
  );

  // Gather progress for locked badges — batch by progressType
  const progressCache = new Map<string, number>();

  for (const badge of allBadges) {
    if (earnedMap.has(badge.id)) continue;
    const pt = (badge as any).progressType;
    if (pt && !progressCache.has(pt)) {
      progressCache.set(pt, await getProgress(prisma, userId, pt));
    }
  }

  const earned = userAchievements.map((ua) => ({
    id: ua.achievement.id,
    slug: ua.achievement.slug,
    name: ua.achievement.name,
    description: ua.achievement.description,
    icon: ua.achievement.icon,
    category: ua.achievement.category,
    tier: (ua.achievement as any).tier || "BRONZE",
    xpReward: ua.achievement.xpReward,
    unlockedAt: ua.unlockedAt,
  }));

  const locked = allBadges
    .filter((b) => !earnedMap.has(b.id))
    .map((b) => {
      const pt = (b as any).progressType;
      const target = (b as any).progressTarget;
      const current = pt ? progressCache.get(pt) || 0 : undefined;

      return {
        id: b.id,
        slug: b.slug,
        name: b.name,
        description: b.description,
        icon: b.icon,
        category: b.category,
        tier: (b as any).tier || "BRONZE",
        xpReward: b.xpReward,
        progress:
          current !== undefined && target
            ? { current: Math.min(current, target), target }
            : undefined,
      };
    });

  // Stats
  const byTier: Record<string, number> = {};
  for (const e of earned) {
    byTier[e.tier] = (byTier[e.tier] || 0) + 1;
  }

  return {
    earned,
    locked,
    stats: {
      total: allBadges.length,
      earned: earned.length,
      byTier,
    },
  };
}
