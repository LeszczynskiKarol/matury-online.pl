// ============================================================================
// Gamification Service — XP, Levels, Streaks, Achievements
// Duolingo-inspired progression system
// ============================================================================

import { PrismaClient, AchievementCategory } from "@prisma/client";

// ── XP Rewards ─────────────────────────────────────────────────────────────

const XP_TABLE = {
  CLOSED_CORRECT: 10,
  CLOSED_WRONG: 2, // participation XP
  OPEN_BASE: 5,
  OPEN_PER_PERCENT: 0.2, // 0.2 * score(0-100) = 0-20 XP
  ESSAY_BASE: 10,
  ESSAY_PER_PERCENT: 0.4, // up to 50 XP for essay
  FILL_IN_CORRECT: 12,
  MATCHING_CORRECT: 15,
  ORDERING_CORRECT: 15,
  STREAK_BONUS_PER_DAY: 2, // extra XP multiplied by streak length (capped at 20)
  PERFECT_SESSION_BONUS: 25,
  DIFFICULTY_MULTIPLIER: [1.0, 1.0, 1.2, 1.5, 1.8, 2.0], // index = difficulty
} as const;

// ── Level thresholds (per subject) ─────────────────────────────────────────
// Inspired by Duolingo — exponential growth
const LEVEL_THRESHOLDS = [
  0, // Level 1 (start)
  100, // Level 2
  350, // Level 3
  800, // Level 4
  1500, // Level 5
];

// Global level thresholds (sum of all subjects)
const GLOBAL_LEVEL_THRESHOLDS = [
  0, // Level 1
  200, // Level 2
  600, // Level 3
  1500, // Level 4
  3000, // Level 5
  5000, // Level 6
  8000, // Level 7
  12000, // Level 8
  18000, // Level 9
  25000, // Level 10
];

// ── Calculate XP for an answer ─────────────────────────────────────────────

export function calculateXp(params: {
  questionType: string;
  isCorrect: boolean;
  score: number; // 0.0 - 1.0
  difficulty: number; // 1-5
  currentStreak: number;
}): number {
  const { questionType, isCorrect, score, difficulty, currentStreak } = params;
  const diffMultiplier = XP_TABLE.DIFFICULTY_MULTIPLIER[difficulty] || 1.0;
  let baseXp = 0;

  switch (questionType) {
    case "CLOSED":
    case "TRUE_FALSE":
    case "MULTI_SELECT":
      baseXp = isCorrect ? XP_TABLE.CLOSED_CORRECT : XP_TABLE.CLOSED_WRONG;
      break;
    case "OPEN":
      baseXp = XP_TABLE.OPEN_BASE + score * 100 * XP_TABLE.OPEN_PER_PERCENT;
      break;
    case "ESSAY":
      baseXp = XP_TABLE.ESSAY_BASE + score * 100 * XP_TABLE.ESSAY_PER_PERCENT;
      break;
    case "FILL_IN":
      baseXp = isCorrect ? XP_TABLE.FILL_IN_CORRECT : XP_TABLE.CLOSED_WRONG;
      break;
    case "MATCHING":
    case "ORDERING":
      baseXp = isCorrect ? XP_TABLE.MATCHING_CORRECT : XP_TABLE.CLOSED_WRONG;
      break;
    case "WIAZKA":
    case "EXPERIMENT_DESIGN":
      // Partial scoring — proportional XP like OPEN
      baseXp = XP_TABLE.OPEN_BASE + score * 100 * XP_TABLE.OPEN_PER_PERCENT;
      break;
    case "CLOZE":
    case "ERROR_FIND":
    case "PROOF_ORDER":
    case "TABLE_DATA":
    case "GRAPH_INTERPRET":
    case "LISTENING":
    case "DIAGRAM_LABEL":
    case "CROSS_PUNNETT":
    case "CALCULATION":
      baseXp = isCorrect ? 12 : score > 0 ? Math.round(2 + score * 10) : 2;
      break;
    default:
      baseXp = isCorrect ? 10 : 2;
  }

  // Apply difficulty multiplier
  baseXp = Math.round(baseXp * diffMultiplier);

  // Streak bonus (capped at 20 extra XP)
  const streakBonus = Math.min(
    currentStreak * XP_TABLE.STREAK_BONUS_PER_DAY,
    20,
  );
  baseXp += streakBonus;

  return Math.round(baseXp);
}

// ── Level from XP ──────────────────────────────────────────────────────────

export function getSubjectLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function getGlobalLevel(totalXp: number): number {
  for (let i = GLOBAL_LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= GLOBAL_LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function getXpToNextLevel(
  xp: number,
  thresholds: number[],
): { current: number; next: number; progress: number } {
  let currentLevel = 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) {
      currentLevel = i + 1;
      break;
    }
  }
  const currentThreshold = thresholds[currentLevel - 1] || 0;
  const nextThreshold =
    thresholds[currentLevel] || thresholds[thresholds.length - 1];
  const progress =
    nextThreshold > currentThreshold
      ? (xp - currentThreshold) / (nextThreshold - currentThreshold)
      : 1.0;

  return {
    current: currentThreshold,
    next: nextThreshold,
    progress: Math.min(progress, 1.0),
  };
}

// ── Streak management ──────────────────────────────────────────────────────

export async function updateStreak(
  prisma: PrismaClient,
  userId: string,
): Promise<{
  currentStreak: number;
  longestStreak: number;
  isNewDay: boolean;
}> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { currentStreak: true, longestStreak: true, lastActiveAt: true },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastActive = user.lastActiveAt
    ? new Date(
        user.lastActiveAt.getFullYear(),
        user.lastActiveAt.getMonth(),
        user.lastActiveAt.getDate(),
      )
    : null;

  let newStreak = user.currentStreak;
  let isNewDay = false;

  if (!lastActive || lastActive < today) {
    isNewDay = true;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastActive && lastActive.getTime() === yesterday.getTime()) {
      // Consecutive day — extend streak
      newStreak = user.currentStreak + 1;
    } else if (!lastActive || lastActive < yesterday) {
      // Streak broken — reset
      newStreak = 1;
    }
  }

  const longestStreak = Math.max(user.longestStreak, newStreak);

  await prisma.user.update({
    where: { id: userId },
    data: {
      currentStreak: newStreak,
      longestStreak,
      lastActiveAt: now,
    },
  });

  return { currentStreak: newStreak, longestStreak, isNewDay };
}

// ── Award XP (subject + global) ────────────────────────────────────────────

export async function awardXp(
  prisma: PrismaClient,
  userId: string,
  subjectId: string,
  xp: number,
): Promise<{
  totalXp: number;
  globalLevel: number;
  subjectXp: number;
  subjectLevel: number;
  leveledUp: boolean;
}> {
  // 1. Subject progress — single upsert with increment
  const sp = await prisma.subjectProgress.upsert({
    where: { userId_subjectId: { userId, subjectId } },
    update: { xp: { increment: xp } },
    create: { userId, subjectId, xp },
  });

  const newSubjectLevel = getSubjectLevel(sp.xp);
  const leveledUp = newSubjectLevel > sp.level;

  if (leveledUp) {
    await prisma.subjectProgress.update({
      where: { id: sp.id },
      data: { level: newSubjectLevel },
    });
  }

  // 2. Global XP — single increment, read back new values
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { totalXp: { increment: xp } },
    select: { totalXp: true, globalLevel: true },
  });

  const globalLevel = getGlobalLevel(updated.totalXp);

  // 3. Second write ONLY when level actually changed
  if (updated.globalLevel !== globalLevel) {
    await prisma.user.update({
      where: { id: userId },
      data: { globalLevel },
    });
  }

  return {
    totalXp: updated.totalXp,
    globalLevel,
    subjectXp: sp.xp,
    subjectLevel: newSubjectLevel,
    leveledUp,
  };
}

// ── Check achievements ─────────────────────────────────────────────────────

export async function checkAchievements(
  prisma: PrismaClient,
  userId: string,
): Promise<{
  unlocked: { slug: string; name: string; icon: string; xpReward: number }[];
}> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      achievements: { select: { achievementId: true } },
      subjectProgress: true,
    },
  });

  const earnedIds = new Set(user.achievements.map((a) => a.achievementId));
  const allAchievements = await prisma.achievement.findMany({
    where: { isActive: true },
  });
  const unlocked: {
    slug: string;
    name: string;
    icon: string;
    xpReward: number;
  }[] = [];

  for (const ach of allAchievements) {
    if (earnedIds.has(ach.id)) continue;

    const val = ach.conditionValue as Record<string, any>;
    let earned = false;

    switch (ach.conditionType) {
      case "streak":
        earned = user.currentStreak >= (val.threshold || 0);
        break;
      case "total_xp":
        earned = user.totalXp >= (val.threshold || 0);
        break;
      case "subject_level":
        earned = user.subjectProgress.some(
          (sp) =>
            sp.level >= (val.level || 0) &&
            (!val.subjectId || sp.subjectId === val.subjectId),
        );
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
    }

    if (earned) {
      await prisma.userAchievement.create({
        data: { userId, achievementId: ach.id },
      });

      if (ach.xpReward > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { totalXp: { increment: ach.xpReward } },
        });
      }

      unlocked.push({
        slug: ach.slug,
        name: ach.name,
        icon: ach.icon,
        xpReward: ach.xpReward,
      });
    }
  }

  return { unlocked };
}
