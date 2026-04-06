import { useStore } from '@nanostores/react';
import { $xpPopup, $levelUpPopup, $achievementPopup } from '../../stores/auth';

export function GamificationOverlays() {
  const xpPopup = useStore($xpPopup);
  const levelUp = useStore($levelUpPopup);
  const achievement = useStore($achievementPopup);

  return (
    <>
      {/* XP popup — bottom right toast */}
      {xpPopup.visible && (
        <div className="fixed bottom-6 right-6 z-50 animate-xp-pop">
          <div className="xp-badge text-base px-4 py-2 shadow-glow-green">
            +{xpPopup.xp} XP
          </div>
        </div>
      )}

      {/* Level up — center modal */}
      {levelUp.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="glass-card p-10 text-center animate-scale-in max-w-sm mx-4">
            <div className="text-6xl mb-4 animate-streak-fire">🎉</div>
            <h2 className="font-display font-extrabold text-2xl mb-2">Awans!</h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-2">Osiągnięto poziom</p>
            <div className="font-display font-black text-6xl text-gradient mb-4">{levelUp.level}</div>
            {levelUp.subject && (
              <p className="text-sm text-zinc-500">w {levelUp.subject}</p>
            )}
          </div>
        </div>
      )}

      {/* Achievement unlock — top center banner */}
      {achievement.visible && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="glass-card px-6 py-4 flex items-center gap-4 shadow-lg">
            <span className="text-3xl animate-streak-fire">{achievement.icon}</span>
            <div>
              <p className="text-xs font-semibold text-brand-500">Nowe osiągnięcie!</p>
              <p className="font-display font-bold">{achievement.name}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
