import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface GamificationEvent {
  type: "badge" | "level_up" | "title" | "streak";
  icon: string;
  title: string;
  subtitle: string;
  tier?: string;
  color?: string;
  xp?: number;
}

// ── Global event bus ───────────────────────────────────────────────────────

type Listener = (event: GamificationEvent) => void;
const listeners = new Set<Listener>();

export function emitGamificationEvent(event: GamificationEvent) {
  listeners.forEach((fn) => fn(event));
}

// ── Helper: process answer submit response ─────────────────────────────────

const TITLE_THRESHOLDS = [
  { level: 1, name: "Maturalny Bot", emoji: "🤖", color: "#94a3b8" },
  { level: 2, name: "Bambik", emoji: "🦌", color: "#60a5fa" },
  { level: 4, name: "Kujon", emoji: "🤓", color: "#a78bfa" },
  { level: 7, name: "Maszyna", emoji: "⚙️", color: "#f59e0b" },
  { level: 10, name: "GOAT", emoji: "🐐", color: "#ef4444" },
];

let previousGlobalLevel = 0;

export function processGamificationResponse(gamification: {
  totalXp: number;
  globalLevel: number;
  subjectLevel: number;
  leveledUp: boolean;
  streak: number;
  isNewDay: boolean;
  achievements: {
    slug: string;
    name: string;
    icon: string;
    xpReward: number;
  }[];
}) {
  if (!gamification) return;

  // Badges
  for (const badge of gamification.achievements || []) {
    emitGamificationEvent({
      type: "badge",
      icon: badge.icon,
      title: badge.name,
      subtitle: `Nowa odznaka! +${badge.xpReward} XP`,
      xp: badge.xpReward,
    });
  }

  // Level up
  if (gamification.leveledUp) {
    emitGamificationEvent({
      type: "level_up",
      icon: "⬆️",
      title: `Poziom ${gamification.subjectLevel}!`,
      subtitle: "Nowy poziom w przedmiocie",
    });
  }

  // Title change — check if globalLevel crossed a title threshold
  if (
    previousGlobalLevel > 0 &&
    previousGlobalLevel !== gamification.globalLevel
  ) {
    const oldTitle = TITLE_THRESHOLDS.filter(
      (t) => previousGlobalLevel >= t.level,
    ).pop();
    const newTitle = TITLE_THRESHOLDS.filter(
      (t) => gamification.globalLevel >= t.level,
    ).pop();
    if (newTitle && oldTitle && newTitle.name !== oldTitle.name) {
      emitGamificationEvent({
        type: "title",
        icon: newTitle.emoji,
        title: newTitle.name,
        subtitle: `Nowy tytuł! Jesteś teraz ${newTitle.name}`,
        color: newTitle.color,
      });
    }
  }
  previousGlobalLevel = gamification.globalLevel;

  // Streak milestone
  if (
    gamification.isNewDay &&
    [3, 7, 14, 30, 50, 100].includes(gamification.streak)
  ) {
    emitGamificationEvent({
      type: "streak",
      icon: "🔥",
      title: `Seria ${gamification.streak} dni!`,
      subtitle: "Nie zatrzymuj się!",
    });
  }
}

// ── Tier colors for toast border ───────────────────────────────────────────

const TIER_BG: Record<string, string> = {
  badge: "#6366f1",
  level_up: "#22c55e",
  title: "#f59e0b",
  streak: "#ef4444",
};

// ── Toast Component ────────────────────────────────────────────────────────

export function GamificationToasts() {
  const [queue, setQueue] = useState<(GamificationEvent & { id: number })[]>(
    [],
  );
  const [visible, setVisible] = useState<
    (GamificationEvent & { id: number }) | null
  >(null);

  const addToast = useCallback((event: GamificationEvent) => {
    setQueue((prev) => [...prev, { ...event, id: Date.now() + Math.random() }]);
  }, []);

  // Subscribe to events
  useEffect(() => {
    listeners.add(addToast);
    return () => {
      listeners.delete(addToast);
    };
  }, [addToast]);

  // Show next in queue
  useEffect(() => {
    if (visible || queue.length === 0) return;
    const next = queue[0];
    setQueue((prev) => prev.slice(1));
    setVisible(next);

    const timer = setTimeout(() => setVisible(null), 4000);
    return () => clearTimeout(timer);
  }, [visible, queue]);

  if (!visible) return null;

  const accentColor = visible.color || TIER_BG[visible.type] || "#6366f1";

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] animate-toast-in pointer-events-auto"
      onClick={() => setVisible(null)}
    >
      <div
        className="flex items-center gap-3 pl-4 pr-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl cursor-pointer
          bg-white/95 dark:bg-surface-800/95 border"
        style={{ borderColor: accentColor + "50" }}
      >
        {/* Accent dot */}
        <div
          className="w-1.5 h-10 rounded-full flex-shrink-0"
          style={{ background: accentColor }}
        />

        {/* Icon */}
        <span className="text-3xl flex-shrink-0">{visible.icon}</span>

        {/* Text */}
        <div className="min-w-0">
          <p className="font-display font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
            {visible.title}
          </p>
          <p className="text-xs text-zinc-500 truncate">{visible.subtitle}</p>
        </div>

        {/* XP pill */}
        {visible.xp && visible.xp > 0 && (
          <span className="xp-badge flex-shrink-0">+{visible.xp} XP</span>
        )}
      </div>
    </div>
  );
}
