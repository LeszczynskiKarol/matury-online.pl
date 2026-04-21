import { useState, useEffect } from "react";
import { dashboard as dashboardApi, gamification } from "../../lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

export function StatsPage() {
  const [data, setData] = useState<any>(null);
  const [streakData, setStreakData] = useState<any>(null);

  useEffect(() => {
    Promise.all([dashboardApi.main(), gamification.streak()])
      .then(([d, s]) => {
        setData(d);
        setStreakData(s);
      })
      .catch(console.error);
  }, []);

  if (!data)
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"
          />
        ))}
      </div>
    );

  const { accuracyTrend, subjectProgress, user } = data;

  return (
    <div className="space-y-8 animate-fade-in">
      <h1 className="font-display font-bold text-2xl">Statystyki</h1>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="text-2xl font-display font-bold">
            {user.totalXp.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500">Łączne XP</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-display font-bold">
            {user.globalLevel}
          </div>
          <div className="text-xs text-zinc-500">Globalny poziom</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-display font-bold text-orange-500">
            {user.currentStreak}
          </div>
          <div className="text-xs text-zinc-500">Aktualna seria</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-display font-bold">
            {user.longestStreak}
          </div>
          <div className="text-xs text-zinc-500">Najdłuższa seria</div>
        </div>
      </div>

      {/* Accuracy trend chart */}
      {accuracyTrend.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="font-display font-semibold mb-4">
            Celność (ostatnie 30 dni)
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={accuracyTrend}>
              <defs>
                <linearGradient
                  id="gradientAccuracy"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                tick={{ fontSize: 11 }}
                stroke="#71717a"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                stroke="#71717a"
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1a2e",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Area
                type="monotone"
                dataKey="avgScore"
                stroke="#22c55e"
                fill="url(#gradientAccuracy)"
                strokeWidth={2}
                name="Celność %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Questions per day */}
      {accuracyTrend.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="font-display font-semibold mb-4">Pytania dziennie</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={accuracyTrend}>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                tick={{ fontSize: 11 }}
                stroke="#71717a"
              />
              <YAxis tick={{ fontSize: 11 }} stroke="#71717a" />
              <Tooltip
                contentStyle={{
                  background: "#1a1a2e",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
              />
              <Bar
                dataKey="questionsAnswered"
                fill="#6366f1"
                radius={[6, 6, 0, 0]}
                name="Pytania"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-subject breakdown */}
      {subjectProgress.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="font-display font-semibold mb-4">
            Postępy per przedmiot
          </h2>
          <div className="space-y-4">
            {subjectProgress.map((sp: any) => (
              <div key={sp.subject.slug} className="flex items-center gap-4">
                <span className="text-xl w-8">{sp.subject.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {sp.subject.name}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Poziom {sp.level} · {sp.accuracy}% · {sp.xp} XP
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${sp.accuracy}%`,
                        background: sp.subject.color,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity heatmap (30 days) */}
      {streakData?.recentActivity && (
        <div className="glass-card p-6">
          <h2 className="font-display font-semibold mb-4">
            Aktywność (30 dni)
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {streakData.recentActivity.map((day: any, i: number) => {
              const intensity = Math.min(
                4,
                Math.ceil((day.questionsCompleted || 0) / 3),
              );
              const colors = [
                "bg-zinc-100 dark:bg-zinc-800",
                "bg-brand-200",
                "bg-brand-300",
                "bg-brand-400",
                "bg-brand-500",
              ];
              return (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-md ${colors[intensity]}`}
                  title={`${day.date}: ${day.questionsCompleted} pytań`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
