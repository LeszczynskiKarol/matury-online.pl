import { useState, useEffect } from 'react';
import { gamification } from '../../lib/api';

export function RankingPage() {
  const [leaders, setLeaders] = useState<any[]>([]);

  useEffect(() => {
    gamification.leaderboard().then(setLeaders).catch(console.error);
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <h1 className="font-display font-bold text-2xl">Ranking</h1>

      <div className="glass-card divide-y divide-zinc-200 dark:divide-zinc-700 overflow-hidden">
        {leaders.length === 0 ? (
          <p className="p-8 text-center text-zinc-500">Brak danych rankingu.</p>
        ) : (
          leaders.map((u: any) => (
            <div key={u.id} className={`flex items-center gap-4 px-6 py-4 ${u.rank <= 3 ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''}`}>
              <span className="w-8 text-center font-display font-bold text-lg">
                {u.rank <= 3 ? medals[u.rank - 1] : u.rank}
              </span>
              <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center overflow-hidden">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display font-bold text-sm">{(u.name || '?')[0]}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{u.name || 'Anonim'}</p>
                <p className="text-xs text-zinc-500">Poziom {u.globalLevel}</p>
              </div>
              <div className="text-right">
                <p className="font-display font-bold text-sm">{u.totalXp?.toLocaleString()} XP</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
