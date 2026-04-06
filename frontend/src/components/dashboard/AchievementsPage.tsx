import { useState, useEffect } from 'react';
import { gamification } from '../../lib/api';

export function AchievementsPage() {
  const [data, setData] = useState<{ earned: any[]; locked: any[] } | null>(null);
  const [levelData, setLevelData] = useState<any>(null);

  useEffect(() => {
    Promise.all([gamification.achievements(), gamification.level()])
      .then(([a, l]) => { setData(a); setLevelData(l); })
      .catch(console.error);
  }, []);

  if (!data) return <div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />)}</div>;

  return (
    <div className="space-y-8 animate-fade-in">
      <h1 className="font-display font-bold text-2xl">Osiągnięcia</h1>

      {/* Level overview */}
      {levelData && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-6 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-navy-600 flex items-center justify-center">
              <span className="font-display font-black text-2xl text-white">{levelData.global.level}</span>
            </div>
            <div className="flex-1">
              <p className="font-display font-bold text-lg">Poziom globalny {levelData.global.level}</p>
              <p className="text-sm text-zinc-500">{levelData.global.totalXp} XP łącznie</p>
              <div className="mt-2 progress-bar">
                <div className="progress-bar-fill" style={{ width: `${Math.round(levelData.global.progress * 100)}%` }} />
              </div>
              <p className="text-xs text-zinc-400 mt-1">{levelData.global.next - levelData.global.totalXp} XP do poziomu {levelData.global.level + 1}</p>
            </div>
          </div>

          {levelData.subjects.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {levelData.subjects.map((sp: any) => (
                <div key={sp.subject.slug} className="p-3 rounded-xl bg-zinc-50 dark:bg-surface-800 text-center">
                  <span className="text-xl">{sp.subject.icon}</span>
                  <div className="font-display font-bold text-sm mt-1">Lvl {sp.level}</div>
                  <div className="text-[10px] text-zinc-500">{sp.xp} XP</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Earned */}
      {data.earned.length > 0 && (
        <div>
          <h2 className="font-display font-semibold mb-3">Zdobyte ({data.earned.length})</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.earned.map((a: any) => (
              <div key={a.slug} className="achievement-card">
                <span className="text-3xl">{a.icon}</span>
                <div>
                  <p className="font-display font-semibold text-sm">{a.name}</p>
                  <p className="text-xs text-zinc-500">{a.description}</p>
                  {a.xpReward > 0 && <span className="xp-badge mt-1">+{a.xpReward} XP</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked */}
      {data.locked.length > 0 && (
        <div>
          <h2 className="font-display font-semibold mb-3">Do zdobycia ({data.locked.length})</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.locked.map((a: any) => (
              <div key={a.id} className="achievement-card locked">
                <span className="text-3xl">{a.icon}</span>
                <div>
                  <p className="font-display font-semibold text-sm">{a.name}</p>
                  <p className="text-xs text-zinc-500">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
