import { useState, useEffect, useRef } from "react";
import { gamification, subjects as subjectsApi, auth } from "../../lib/api";

const TIER_COLORS: Record<string, { border: string; bg: string }> = {
  BRONZE: { border: "#cd7f32", bg: "#cd7f32" },
  SILVER: { border: "#c0c0c0", bg: "#c0c0c0" },
  GOLD: { border: "#ffd700", bg: "#ffd700" },
  PLATINUM: { border: "#b4e4ff", bg: "#b4e4ff" },
  DIAMOND: { border: "#e879f9", bg: "#e879f9" },
};

const medals = ["🥇", "🥈", "🥉"];

interface LeaderEntry {
  rank: number;
  isCurrentUser: boolean;
  id?: string;
  name: string | null;
  avatarUrl: string | null;
  totalXp?: number;
  xp?: number;
  globalLevel: number;
  currentStreak: number;
  title: { name: string; color: string; emoji: string };
  showcaseBadges: { id: string; icon: string; tier: string; name: string }[];
  user?: any;
  level?: number;
}

function normalize(entry: any): LeaderEntry {
  if (entry.user) {
    return {
      rank: entry.rank,
      isCurrentUser: entry.isCurrentUser,
      id: entry.user.id,
      name: entry.user.name,
      avatarUrl: entry.user.avatarUrl,
      totalXp: entry.xp,
      globalLevel: entry.user.globalLevel,
      currentStreak: entry.user.currentStreak,
      title: entry.user.title,
      showcaseBadges: entry.user.showcaseBadges || [],
      level: entry.level,
    };
  }
  return entry as LeaderEntry;
}

export function RankingPage() {
  const [tab, setTab] = useState<string>("global");
  const [data, setData] = useState<{
    leaders: any[];
    currentUserEntry: any;
    type: string;
  } | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [hidden, setHidden] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const myRowRef = useRef<HTMLDivElement>(null);

  // Fetch subjects list
  useEffect(() => {
    subjectsApi
      .list()
      .then(setSubjects)
      .catch(() => {});
    auth
      .me()
      .then((u) => setCurrentUserId(u.id))
      .catch(() => {});
    // Get visibility status
    gamification
      .leaderboardVisibility()
      .then((v: any) => setHidden(v.hideFromLeaderboard))
      .catch(() => {});
  }, []);

  // Fetch leaderboard
  useEffect(() => {
    const subjectId = tab !== "global" ? tab : undefined;
    gamification
      .leaderboard(subjectId)
      .then((res: any) => {
        if (res.leaders) {
          setData(res);
        } else {
          // Legacy format fallback
          setData({ leaders: res, currentUserEntry: null, type: "global" });
        }
      })
      .catch(console.error);
  }, [tab]);

  const toggleVisibility = async () => {
    setToggling(true);
    try {
      const res = await gamification.toggleLeaderboardVisibility();
      setHidden(res.hideFromLeaderboard);
      // Refetch
      const subjectId = tab !== "global" ? tab : undefined;
      const fresh = await gamification.leaderboard(subjectId);
      if (fresh.leaders) setData(fresh);
    } catch (err) {
      console.error(err);
    } finally {
      setToggling(false);
    }
  };

  const scrollToMe = () => {
    myRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const leaders = (data?.leaders || []).map(normalize);
  const currentEntry = data?.currentUserEntry
    ? normalize(data.currentUserEntry)
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl">Ranking</h1>
        {leaders.some((l) => l.isCurrentUser) && (
          <button
            onClick={scrollToMe}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 transition-colors"
          >
            📍 Znajdź mnie
          </button>
        )}
      </div>

      {/* Subject tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setTab("global")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors
            ${
              tab === "global"
                ? "bg-brand-500/15 text-brand-500"
                : "text-zinc-500 hover:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/50"
            }`}
        >
          🌍 Globalny
        </button>
        {subjects
          .filter((s) => s.isActive)
          .map((s) => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors
              ${
                tab === s.id
                  ? "bg-brand-500/15 text-brand-500"
                  : "text-zinc-500 hover:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/50"
              }`}
            >
              {s.icon} {s.name}
            </button>
          ))}
      </div>

      {/* Visibility toggle */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-50 dark:bg-surface-800 border border-zinc-200 dark:border-zinc-700">
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {hidden ? "🙈 Profil ukryty" : "👁️ Profil widoczny"}
          </p>
          <p className="text-[11px] text-zinc-500">
            {hidden
              ? "Nie pokazujesz się w rankingu dla innych"
              : "Inni widzą Cię w rankingu"}
          </p>
        </div>
        <button
          onClick={toggleVisibility}
          disabled={toggling}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
            ${
              hidden
                ? "bg-brand-500/15 text-brand-500 hover:bg-brand-500/25"
                : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600"
            }`}
        >
          {toggling ? "..." : hidden ? "Pokaż mnie" : "Ukryj mnie"}
        </button>
      </div>

      {/* Current user outside top 50 */}
      {currentEntry && !leaders.some((l) => l.isCurrentUser) && (
        <div className="px-4 py-3 rounded-xl bg-brand-500/5 border border-brand-500/20">
          <p className="text-xs text-brand-500 font-semibold mb-2">
            📍 Twoja pozycja
          </p>
          <LeaderRow
            entry={currentEntry}
            isSubject={tab !== "global"}
            highlight
          />
        </div>
      )}

      {/* Leaderboard */}
      <div className="glass-card overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-700/50">
        {leaders.length === 0 ? (
          <p className="p-8 text-center text-zinc-500">Brak danych rankingu.</p>
        ) : (
          leaders.map((entry) => (
            <div
              key={entry.id || entry.rank}
              ref={entry.isCurrentUser ? myRowRef : undefined}
            >
              <LeaderRow
                entry={entry}
                isSubject={tab !== "global"}
                highlight={entry.isCurrentUser}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LeaderRow({
  entry,
  isSubject,
  highlight,
}: {
  entry: LeaderEntry;
  isSubject: boolean;
  highlight: boolean;
}) {
  const xp = isSubject ? entry.totalXp || entry.xp : entry.totalXp;

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3.5 transition-colors
        ${highlight ? "bg-brand-500/5 dark:bg-brand-500/10 ring-1 ring-brand-500/20 ring-inset rounded-xl" : ""}
        ${entry.rank <= 3 && !highlight ? "bg-amber-50/50 dark:bg-amber-900/5" : ""}`}
    >
      {/* Rank */}
      <span className="w-8 text-center font-display font-bold text-lg flex-shrink-0">
        {entry.rank <= 3 ? medals[entry.rank - 1] : entry.rank}
      </span>

      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center overflow-hidden flex-shrink-0">
        {entry.avatarUrl ? (
          <img
            src={entry.avatarUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-display font-bold text-sm">
            {(entry.name || "?")[0].toUpperCase()}
          </span>
        )}
      </div>

      {/* Name + title + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm truncate">
            {entry.name || "Anonim"}
          </span>
          {highlight && (
            <span className="text-[10px] font-bold px-1.5 py-px rounded bg-brand-500/15 text-brand-500">
              TY
            </span>
          )}
          {entry.title && (
            <span
              className="text-[10px] font-bold px-1.5 py-px rounded-full"
              style={{
                color: entry.title.color,
                background: entry.title.color + "20",
              }}
            >
              {entry.title.emoji} {entry.title.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-zinc-500">
            Poz. {entry.globalLevel}
          </span>
          {entry.currentStreak > 0 && (
            <span className="text-[11px] text-orange-500">
              🔥{entry.currentStreak}
            </span>
          )}
          {isSubject && entry.level && (
            <span className="text-[11px] text-zinc-500">
              · Lv. {entry.level}
            </span>
          )}
          {/* Showcase badges inline */}
          {entry.showcaseBadges.length > 0 && (
            <div className="flex gap-0.5 ml-1">
              {entry.showcaseBadges.map((b) => (
                <span
                  key={b.id}
                  className="w-5 h-5 rounded flex items-center justify-center text-xs"
                  style={{
                    background: (TIER_COLORS[b.tier]?.bg || "#6366f1") + "25",
                    border: `1px solid ${TIER_COLORS[b.tier]?.border || "#6366f1"}50`,
                  }}
                  title={b.name}
                >
                  {b.icon}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* XP */}
      <div className="text-right flex-shrink-0">
        <p className="font-display font-bold text-sm">
          {(xp || 0).toLocaleString()}
        </p>
        <p className="text-[10px] text-zinc-500">XP</p>
      </div>
    </div>
  );
}
