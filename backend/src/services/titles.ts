// ============================================================================
// Title System — derived from globalLevel, auto-assigned
// ============================================================================

export interface Title {
  name: string;
  minLevel: number;
  color: string;
  emoji: string;
  flavorText: string;
}

export const TITLES: Title[] = [
  {
    name: "Maturalny Bot",
    minLevel: 1,
    color: "#94a3b8",
    emoji: "🤖",
    flavorText:
      "Dopiero zaczynasz. Na razie jesteś NPC w tej grze — ale każdy GOAT kiedyś był botem.",
  },
  {
    name: "Bambik",
    minLevel: 2,
    color: "#60a5fa",
    emoji: "🦌",
    flavorText:
      "Już coś umiesz, ale nadal się ślizgasz jak bambi na lodzie. Spokojnie, to normalne.",
  },
  {
    name: "Kujon",
    minLevel: 4,
    color: "#a78bfa",
    emoji: "🤓",
    flavorText:
      "Wkuwasz na poważnie i nie wstydzisz się tego. Twoi znajomi się martwią, ale Twoje wyniki nie.",
  },
  {
    name: "Maszyna",
    minLevel: 7,
    color: "#f59e0b",
    emoji: "⚙️",
    flavorText:
      "Nie da się Cię zatrzymać. Odpowiadasz na pytania szybciej niż nauczyciel je czyta. Terminator matury.",
  },
  {
    name: "GOAT",
    minLevel: 10,
    color: "#ef4444",
    emoji: "🐐",
    flavorText:
      "Legenda. Greatest Of All Time. CKE powinno Cię zatrudnić jako konsultanta. Twoi nauczyciele by płakali ze szczęścia.",
  },
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
  if (idx >= TITLES.length - 1) return null;

  const next = TITLES[idx + 1];
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
