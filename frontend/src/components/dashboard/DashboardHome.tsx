import { useState, useEffect } from "react";
import {
  dashboard as dashboardApi,
  subjects as subjectsApi,
} from "../../lib/api";

interface DashboardData {
  user: any;
  subjectProgress: any[];
  today: any;
  weeklyActivity: any[];
  recentSessions: any[];
  dueReviews: number;
  recentAchievements: any[];
}

export function DashboardHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi
      .main()
      .then(setData)
      .catch(() => {
        window.location.href = "/auth/login";
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return null;

  const {
    user,
    subjectProgress,
    today,
    weeklyActivity,
    recentSessions,
    dueReviews,
    recentAchievements,
  } = data;
  const todayProgress =
    today.targetQuestions > 0
      ? Math.min(
          100,
          Math.round((today.questionsCompleted / today.targetQuestions) * 100),
        )
      : 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl md:text-3xl">
            Cześć{user.name ? `, ${user.name.split(" ")[0]}` : ""}! 👋
          </h1>
          <p className="text-zinc-500 mt-1">
            Kontynuuj naukę i buduj swoją serię.
          </p>
        </div>
        <a href="/dashboard/sesja" className="btn-primary">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          Nowa sesja
        </a>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon="🔥"
          label="Seria"
          value={`${user.currentStreak} dni`}
          accent={user.currentStreak >= 7 ? "text-orange-500" : ""}
        />
        <StatCard
          icon="⭐"
          label="Łączne XP"
          value={user.totalXp.toLocaleString()}
        />
        <StatCard icon="🎯" label="Poziom" value={`${user.globalLevel}`} />
        <StatCard
          icon="📝"
          label="Dziś"
          value={`${today.questionsCompleted}/${today.targetQuestions}`}
          sub={
            <div className="mt-2 progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${todayProgress}%` }}
              />
            </div>
          }
        />
      </div>

      {/* Due reviews alert */}
      {dueReviews > 0 && (
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
          <span className="text-2xl">🧠</span>
          <div className="flex-1">
            <p className="font-semibold text-sm">
              Masz {dueReviews} kart
              {dueReviews === 1 ? "ę" : dueReviews < 5 ? "y" : ""} do powtórki
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Powtórki wzmacniają pamięć długoterminową
            </p>
          </div>
          <a
            href="/dashboard/powtorki"
            className="btn-primary py-2 px-4 text-xs"
          >
            Powtarzaj
          </a>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Subject progress */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-display font-bold text-lg">Twoje przedmioty</h2>
          {subjectProgress.length === 0 ? (
            <div className="glass-card p-8 text-center">
              {user.subscriptionStatus === "FREE" ||
              user.subscriptionStatus === "EXPIRED" ? (
                <>
                  <span className="text-4xl block mb-3">🔒</span>
                  <p className="font-display font-semibold text-sm mb-2">
                    Dostęp tylko dla Premium
                  </p>
                  <p className="text-xs text-zinc-500 mb-4">
                    Wykup subskrypcję, aby rozpocząć naukę i uzyskać dostęp do
                    wszystkich funkcji.
                  </p>
                  <a
                    href="/dashboard/subskrypcja"
                    className="btn-primary py-2 px-6 text-sm"
                  >
                    Przejdź na Premium — 49 zł/mies.
                  </a>
                </>
              ) : (
                <>
                  <p className="text-zinc-500 mb-4">
                    Nie masz jeszcze wybranych przedmiotów.
                  </p>
                  <a
                    href="/dashboard/sesja"
                    className="btn-secondary py-2 px-5 text-sm"
                  >
                    Rozpocznij pierwszą sesję
                  </a>
                </>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {subjectProgress.map((sp: any) => (
                <SubjectProgressCard key={sp.subject.slug} data={sp} />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar — recent activity */}
        <div className="space-y-6">
          {/* Weekly heatmap */}
          <div>
            <h3 className="font-display font-semibold text-sm mb-3">
              Aktywność (7 dni)
            </h3>
            <div className="flex gap-1.5">
              {Array.from({ length: 7 }).map((_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (6 - i));
                const dateStr = date.toISOString().split("T")[0];
                const day = weeklyActivity.find((d: any) =>
                  d.date?.startsWith(dateStr),
                );
                const intensity = day
                  ? Math.min(4, Math.ceil(day.questionsCompleted / 3))
                  : 0;
                const colors = [
                  "bg-zinc-100 dark:bg-zinc-800",
                  "bg-brand-200",
                  "bg-brand-300",
                  "bg-brand-400",
                  "bg-brand-500",
                ];
                const dayName = date.toLocaleDateString("pl", {
                  weekday: "short",
                });

                return (
                  <div key={i} className="flex-1 text-center">
                    <div
                      className={`w-full aspect-square rounded-lg ${colors[intensity]} transition-colors`}
                      title={`${dayName}: ${day?.questionsCompleted || 0} pytań`}
                    />
                    <span className="text-[10px] text-zinc-400 mt-1 block">
                      {dayName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent sessions */}
          <div>
            <h3 className="font-display font-semibold text-sm mb-3">
              Ostatnie sesje
            </h3>
            <div className="space-y-2">
              {recentSessions.length === 0 ? (
                <p className="text-sm text-zinc-500">Brak sesji</p>
              ) : (
                recentSessions.map((s: any) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-surface-800"
                  >
                    <div className="flex items-center gap-2">
                      <span>{s.subject.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{s.subject.name}</p>
                        <p className="text-xs text-zinc-500">
                          {s.questionsAnswered} pytań · {s.accuracy}%
                        </p>
                      </div>
                    </div>
                    <span className="xp-badge">+{s.xpEarned} XP</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent achievements */}
          {recentAchievements.length > 0 && (
            <div>
              <h3 className="font-display font-semibold text-sm mb-3">
                Osiągnięcia
              </h3>
              <div className="space-y-2">
                {recentAchievements.map((a: any) => (
                  <div
                    key={a.slug}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-surface-800"
                  >
                    <span className="text-xl">{a.icon}</span>
                    <div>
                      <p className="text-sm font-semibold">{a.name}</p>
                      <p className="text-xs text-zinc-500">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent = "",
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  accent?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-zinc-500 font-medium">{label}</span>
      </div>
      <div className={`font-display font-bold text-xl ${accent}`}>{value}</div>
      {sub}
    </div>
  );
}

function SubjectProgressCard({ data }: { data: any }) {
  const accuracy = data.questionsAnswered > 0 ? Math.round(data.accuracy) : 0;
  const xpProgress = data.xp; // simplified

  return (
    <a href={`/przedmiot/${data.subject.slug}`} className="subject-card block">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{data.subject.icon}</span>
          <div>
            <h3 className="font-display font-semibold text-sm">
              {data.subject.name}
            </h3>
            <p className="text-xs text-zinc-500">
              {data.questionsAnswered} pytań
            </p>
          </div>
        </div>
        <div
          className="level-badge"
          style={{
            background: data.subject.color + "20",
            color: data.subject.color,
          }}
        >
          {data.level}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span>Celność: {accuracy}%</span>
        <span>·</span>
        <span>{data.xp} XP</span>
      </div>
      <div className="mt-3 progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${Math.min(100, (data.xp % 500) / 5)}%` }}
        />
      </div>
    </a>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-10 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"
          />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-36 bg-zinc-200 dark:bg-zinc-800 rounded-3xl"
            />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
