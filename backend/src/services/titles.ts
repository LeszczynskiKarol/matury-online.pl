// ============================================================================
// Title System — derived from globalLevel, auto-assigned
// ============================================================================

export interface Title {
  name: string;
  minLevel: number;
  color: string; // hex for frontend
  emoji: string;
}

export const TITLES: Title[] = [
  { name: "Maturalny Bot", minLevel: 1, color: "#94a3b8", emoji: "🤖" },
  { name: "Bambik", minLevel: 2, color: "#60a5fa", emoji: "🦌" },
  { name: "Kujon", minLevel: 4, color: "#a78bfa", emoji: "🤓" },
  { name: "Maszyna", minLevel: 7, color: "#f59e0b", emoji: "⚙️" },
  { name: "GOAT", minLevel: 10, color: "#ef4444", emoji: "🐐" },
];

export function getTitleForLevel(globalLevel: number): Title {
  for (let i = TITLES.length - 1; i >= 0; i--) {
    if (globalLevel >= TITLES[i].minLevel) return TITLES[i];
  }
  return TITLES[0];
}

export function getNextTitle(
  globalLevel: number,
): { next: Title; progress: number } | null {
  const current = getTitleForLevel(globalLevel);
  const idx = TITLES.indexOf(current);
  if (idx >= TITLES.length - 1) return null; // already GOAT

  const next = TITLES[idx + 1];
  // progress = how far between current title's minLevel and next title's minLevel
  const range = next.minLevel - current.minLevel;
  const progress = Math.min((globalLevel - current.minLevel) / range, 0.99);
  return { next, progress };
}

export function getAllTitlesWithStatus(globalLevel: number) {
  return TITLES.map((t) => ({
    ...t,
    reached: globalLevel >= t.minLevel,
    isCurrent: getTitleForLevel(globalLevel).name === t.name,
  }));
}
