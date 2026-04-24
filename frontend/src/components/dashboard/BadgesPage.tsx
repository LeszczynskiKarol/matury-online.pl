import { useState, useEffect } from "react";
import { gamification } from "../../lib/api";

// ── Tier visual config ─────────────────────────────────────────────────────

const TIER_COLORS: Record<
  string,
  { border: string; bg: string; text: string; glow: string }
> = {
  BRONZE: {
    border: "#cd7f32",
    bg: "linear-gradient(135deg, #cd7f32, #b87333)",
    text: "#1a1a2e",
    glow: "rgba(205,127,50,0.25)",
  },
  SILVER: {
    border: "#c0c0c0",
    bg: "linear-gradient(135deg, #e8e8e8, #c0c0c0)",
    text: "#1a1a2e",
    glow: "rgba(192,192,192,0.25)",
  },
  GOLD: {
    border: "#ffd700",
    bg: "linear-gradient(135deg, #ffd700, #ffb300)",
    text: "#1a1a2e",
    glow: "rgba(255,215,0,0.3)",
  },
  PLATINUM: {
    border: "#b4e4ff",
    bg: "linear-gradient(135deg, #e0f4ff, #b4e4ff)",
    text: "#1a1a2e",
    glow: "rgba(180,228,255,0.3)",
  },
  DIAMOND: {
    border: "#e879f9",
    bg: "linear-gradient(145deg, #c084fc, #e879f9 50%, #67e8f9)",
    text: "#1a1a2e",
    glow: "rgba(232,121,249,0.35)",
  },
};

const TIER_LABELS: Record<string, string> = {
  BRONZE: "Brąz",
  SILVER: "Srebro",
  GOLD: "Złoto",
  PLATINUM: "Platyna",
  DIAMOND: "Diament",
};

const CATEGORY_META: Record<string, { icon: string; label: string }> = {
  STREAK: { icon: "🔥", label: "Seria" },
  PERFECT: { icon: "💎", label: "Perfekcja" },
  VOLUME: { icon: "📚", label: "Ilość" },
  MASTERY: { icon: "🎓", label: "Przedmioty" },
  MILESTONE: { icon: "🏆", label: "Kamienie milowe" },
  SPECIAL: { icon: "⭐", label: "Specjalne" },
};

// ── Badge card component ───────────────────────────────────────────────────

function BadgeCard({
  badge,
  isEarned,
  onShowcaseToggle,
  isShowcased,
}: {
  badge: any;
  isEarned: boolean;
  onShowcaseToggle?: () => void;
  isShowcased?: boolean;
}) {
  const tier = TIER_COLORS[badge.tier] || TIER_COLORS.BRONZE;

  return (
    <div
      className={`relative p-4 rounded-2xl border-2 transition-all duration-200 group
        ${
          isEarned
            ? "bg-surface-50/5 hover:shadow-lg cursor-pointer"
            : "bg-black/20 opacity-50"
        }`}
      style={{
        borderColor: isEarned ? tier.border : "rgba(255,255,255,0.06)",
      }}
      onClick={isEarned ? onShowcaseToggle : undefined}
    >
      {/* Top accent */}
      {isEarned && (
        <div
          className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
          style={{ background: tier.bg }}
        />
      )}

      {/* Showcase star */}
      {isShowcased && <div className="absolute top-2 right-2 text-xs">📌</div>}

      <div className="flex items-center gap-3">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{
            background: isEarned ? tier.bg : "#1e1e30",
            filter: isEarned ? "none" : "grayscale(1)",
            boxShadow: isEarned ? `0 4px 16px ${tier.glow}` : "none",
          }}
        >
          {isEarned ? badge.icon : "🔒"}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={`font-display font-bold text-sm ${isEarned ? "text-zinc-100" : "text-zinc-500"}`}
            >
              {badge.name}
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-px rounded-md uppercase tracking-wider"
              style={{
                background: isEarned ? tier.bg : "#2a2a3e",
                color:
                  isEarned &&
                  badge.tier !== "SILVER" &&
                  badge.tier !== "PLATINUM"
                    ? tier.text
                    : "#a1a1aa",
              }}
            >
              {TIER_LABELS[badge.tier]}
            </span>
          </div>

          <div className="text-xs text-zinc-500 truncate">
            {badge.description}
          </div>

          {/* XP reward */}
          {isEarned && badge.xpReward > 0 && (
            <span className="xp-badge mt-1 inline-block">
              +{badge.xpReward} XP
            </span>
          )}

          {/* Progress bar for locked */}
          {!isEarned && badge.progress && (
            <div className="mt-2">
              <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(badge.progress.current / badge.progress.target) * 100}%`,
                    background: tier.bg,
                  }}
                />
              </div>
              <div className="text-[10px] text-zinc-600 mt-1 tabular-nums">
                {badge.progress.current}/{badge.progress.target}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function BadgesPage() {
  const [tab, setTab] = useState<"profile" | "labels" | "badges">("profile");
  const [badgeData, setBadgeData] = useState<any>(null);
  const [labelData, setLabelData] = useState<any>(null);
  const [levelData, setLevelData] = useState<any>(null);
  const [titleData, setTitleData] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [activeCat, setActiveCat] = useState("STREAK");
  const [showcaseIds, setShowcaseIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      gamification.badges(),
      gamification.labels(),
      gamification.level(),
      gamification.title(),
      gamification.profile(),
    ])
      .then(([b, l, lv, t, p]) => {
        setBadgeData(b);
        setLabelData(l);
        setLevelData(lv);
        setTitleData(t);
        setProfileData(p);
        setShowcaseIds(p.showcaseBadgeIds || []);
      })
      .catch(console.error);
  }, []);

  if (!badgeData)
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"
          />
        ))}
      </div>
    );

  const categories = Object.keys(CATEGORY_META);

  // Group badges by category
  const earnedByCategory: Record<string, any[]> = {};
  const lockedByCategory: Record<string, any[]> = {};

  for (const cat of categories) {
    earnedByCategory[cat] = badgeData.earned.filter(
      (b: any) => b.category === cat,
    );
    lockedByCategory[cat] = badgeData.locked.filter(
      (b: any) => b.category === cat,
    );
  }

  const toggleShowcase = async (badgeId: string) => {
    let next: string[];
    if (showcaseIds.includes(badgeId)) {
      next = showcaseIds.filter((id) => id !== badgeId);
    } else if (showcaseIds.length < 3) {
      next = [...showcaseIds, badgeId];
    } else {
      return; // max 3
    }
    setShowcaseIds(next);
    await gamification.setShowcase(next).catch(console.error);
  };

  // Find next badge closest to unlocking
  const closestBadge = badgeData.locked
    .filter((b: any) => b.progress)
    .sort(
      (a: any, b: any) =>
        b.progress.current / b.progress.target -
        a.progress.current / a.progress.target,
    )[0];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-display font-bold text-2xl">Odznaki & Etykiety</h1>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 pb-px">
        {(
          [
            { id: "profile", label: "👤 Profil" },
            { id: "badges", label: "🏅 Odznaki" },
            { id: "labels", label: "🏷️ Etykiety" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors
              ${
                tab === t.id
                  ? "text-brand-500 bg-brand-500/10"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ BADGES TAB ═══ */}
      {tab === "badges" && (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-card p-4 text-center">
              <div className="font-display font-black text-2xl text-brand-500">
                {badgeData.stats.earned}/{badgeData.stats.total}
              </div>
              <div className="text-[11px] text-zinc-500 font-medium">
                Zdobyte
              </div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="font-display font-black text-2xl text-yellow-500">
                {badgeData.stats.byTier?.GOLD || 0}
              </div>
              <div className="text-[11px] text-zinc-500 font-medium">Złote</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="font-display font-black text-2xl text-fuchsia-400">
                {badgeData.stats.byTier?.DIAMOND || 0}
              </div>
              <div className="text-[11px] text-zinc-500 font-medium">
                Diamentowe
              </div>
            </div>
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {categories.map((cat) => {
              const meta = CATEGORY_META[cat];
              const earned = earnedByCategory[cat]?.length || 0;
              const total = earned + (lockedByCategory[cat]?.length || 0);
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCat(cat)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors
                    ${
                      activeCat === cat
                        ? "bg-brand-500/15 text-brand-400"
                        : "bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-500 dark:hover:text-zinc-400"
                    }`}
                >
                  {meta.icon} {meta.label}
                  <span
                    className={`text-[10px] px-1.5 rounded-full ${
                      activeCat === cat
                        ? "bg-brand-500/20"
                        : "bg-zinc-200 dark:bg-zinc-700/50"
                    }`}
                  >
                    {earned}/{total}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Badge list */}
          <div className="space-y-2">
            {(earnedByCategory[activeCat] || []).map((badge: any) => (
              <BadgeCard
                key={badge.slug}
                badge={badge}
                isEarned
                isShowcased={showcaseIds.includes(badge.id)}
                onShowcaseToggle={() => toggleShowcase(badge.id)}
              />
            ))}
            {(lockedByCategory[activeCat] || []).map((badge: any) => (
              <BadgeCard key={badge.slug} badge={badge} isEarned={false} />
            ))}
          </div>

          {/* Next unlock hint */}
          {closestBadge && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-brand-500/5 to-pink-500/5 border border-dashed border-brand-500/20">
              <div className="text-[11px] font-bold text-brand-500 uppercase tracking-wider mb-1">
                💡 Następna odznaka w zasięgu
              </div>
              <div className="text-sm text-zinc-400">
                <strong className="text-zinc-200">{closestBadge.name}</strong> —
                jeszcze{" "}
                {closestBadge.progress.target - closestBadge.progress.current}{" "}
                do odblokowania!
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ LABELS TAB ═══ */}
      {tab === "labels" && labelData && (
        <div className="space-y-6">
          <div className="glass-card p-4">
            <p className="text-sm text-zinc-400 leading-relaxed">
              Etykiety to dynamiczne{" "}
              <strong className="text-zinc-200">GitHub-style labels</strong>{" "}
              widoczne przy Twoim profilu w leaderboardzie. Odświeżają się
              automatycznie — tracisz serię, etykieta znika.
            </p>
          </div>

          {/* Active labels */}
          {labelData.active.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-sm text-zinc-400 mb-3">
                Twoje aktywne etykiety
              </h2>
              <div className="flex flex-wrap gap-2">
                {labelData.active.map((l: any) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      color: l.color,
                      background: l.color + "15",
                      border: `1px solid ${l.color}30`,
                    }}
                  >
                    {l.text}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* All labels */}
          <div>
            <h2 className="font-display font-semibold text-sm text-zinc-400 mb-3">
              Wszystkie etykiety
            </h2>
            <div className="space-y-2">
              {labelData.all.map((l: any) => (
                <div
                  key={l.id}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all
                    ${l.isActive ? "bg-white/[0.03]" : "bg-black/15 opacity-50"}`}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: l.isActive ? l.color : "#52525b" }}
                  >
                    {l.text}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      l.isActive
                        ? "bg-green-500/15 text-green-500"
                        : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-600"
                    }`}
                  >
                    {l.isActive ? "AKTYWNA" : "ZABLOKOWANA"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PROFILE TAB ═══ */}
      {tab === "profile" && profileData && levelData && titleData && (
        <div className="space-y-6">
          {/* Profile preview card */}
          <div className="glass-card p-6 bg-gradient-to-br from-brand-500/5 via-transparent to-pink-500/5">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-brand-500/20">
                {profileData.name?.[0]?.toUpperCase() || "?"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-xl">
                    {profileData.name}
                  </span>
                  <span
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                    style={{
                      color: profileData.title.color,
                      background: profileData.title.color + "20",
                      border: `1px solid ${profileData.title.color}35`,
                    }}
                  >
                    {profileData.title.emoji} {profileData.title.name}
                  </span>
                </div>
                <div className="text-sm text-zinc-500 mt-0.5">
                  Poziom {profileData.globalLevel} ·{" "}
                  {profileData.totalXp.toLocaleString()} XP · 🔥{" "}
                  {profileData.currentStreak} dni
                </div>
              </div>
            </div>

            {/* Labels */}
            {profileData.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {profileData.labels.map((l: any) => (
                  <span
                    key={l.id}
                    className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      color: l.color,
                      background: l.color + "10",
                      border: `1px solid ${l.color}25`,
                    }}
                  >
                    {l.text}
                  </span>
                ))}
              </div>
            )}

            {/* Title progress bar */}
            {titleData.next && (
              <div className="p-3 rounded-xl bg-zinc-100 dark:bg-black/30">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-zinc-500">
                    <span
                      className="font-bold"
                      style={{ color: titleData.current.color }}
                    >
                      {titleData.current.name}
                    </span>
                    {" → "}
                    <span
                      className="font-bold"
                      style={{ color: titleData.next.next.color }}
                    >
                      {titleData.next.next.name}
                    </span>
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-600 font-mono">
                    Poz. {titleData.globalLevel}/{titleData.next.next.minLevel}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${titleData.next.progress * 100}%`,
                      background: `linear-gradient(90deg, ${titleData.current.color}, ${titleData.next.next.color})`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Showcase badges */}
            <div className="mt-4">
              <div className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider mb-2">
                Wyróżnione odznaki (kliknij odznakę w zakładce Odznaki aby
                dodać)
              </div>
              <div className="flex gap-2">
                {profileData.showcaseBadges.map((b: any) => {
                  const tier = TIER_COLORS[b.tier] || TIER_COLORS.BRONZE;
                  return (
                    <div
                      key={b.id}
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                      style={{
                        background: tier.bg,
                        boxShadow: `0 4px 16px ${tier.glow}`,
                      }}
                      title={b.name}
                    >
                      {b.icon}
                    </div>
                  );
                })}
                {Array.from({
                  length: 3 - (profileData.showcaseBadges?.length || 0),
                }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="w-12 h-12 rounded-xl border-2 border-dashed border-zinc-800 flex items-center justify-center text-zinc-700"
                  >
                    +
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Title ladder */}
          <div>
            <h2 className="font-display font-semibold text-sm text-zinc-400 mb-3">
              Drabina tytułów
            </h2>
            <div className="space-y-1.5">
              {titleData.allTitles.map((t: any) => (
                <div
                  key={t.name}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all
                    ${t.reached ? "bg-white/[0.03]" : "bg-black/15 opacity-40"}
                    `}
                  style={{
                    boxShadow: t.isCurrent
                      ? `inset 0 0 0 1px ${t.color}50`
                      : undefined,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
                    style={{
                      background: t.reached ? t.color + "20" : "#1e1e30",
                      color: t.reached ? t.color : "#3f3f46",
                      border: `1px solid ${t.reached ? t.color + "40" : "#2a2a3e"}`,
                    }}
                  >
                    {t.emoji}
                  </div>
                  <span
                    className="font-display font-bold text-sm flex-1"
                    style={{ color: t.reached ? t.color : "#52525b" }}
                  >
                    {t.name}
                  </span>
                  <span className="text-[11px] text-zinc-600 font-mono">
                    Poz. {t.minLevel}+
                  </span>
                  {t.isCurrent && <span className="text-sm">◀</span>}
                  {t.reached && !t.isCurrent && (
                    <span className="text-sm text-green-500">✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
