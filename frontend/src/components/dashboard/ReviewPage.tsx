import { useState, useEffect } from 'react';
import { review as reviewApi } from '../../lib/api';

export function ReviewPage() {
  const [stats, setStats] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'stats' | 'review' | 'done'>('stats');

  useEffect(() => {
    Promise.all([reviewApi.stats(), reviewApi.due({ limit: 20 })])
      .then(([s, c]) => { setStats(s); setCards(c); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const rateCard = async (quality: number) => {
    const card = cards[currentIndex];
    if (!card) return;
    await reviewApi.submit({ cardId: card.cardId, quality }).catch(console.error);

    if (currentIndex + 1 >= cards.length) {
      setPhase('done');
    } else {
      setCurrentIndex((i) => i + 1);
      setShowAnswer(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (phase === 'done') {
    return (
      <div className="max-w-md mx-auto text-center py-16 animate-scale-in">
        <div className="text-5xl mb-4">🧠</div>
        <h2 className="font-display font-bold text-2xl mb-2">Powtórki ukończone!</h2>
        <p className="text-zinc-500 mb-6">Przejrzano {cards.length} kart. Wróć jutro po kolejne.</p>
        <a href="/dashboard" className="btn-primary">Wróć do dashboard</a>
      </div>
    );
  }

  if (phase === 'stats') {
    return (
      <div className="max-w-lg mx-auto space-y-8 animate-fade-in">
        <div>
          <h1 className="font-display font-bold text-2xl mb-2">Powtórki (Spaced Repetition)</h1>
          <p className="text-zinc-500">Algorytm SM-2 pilnuje, żebyś powtarzał materiał w idealnych momentach.</p>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card text-center">
              <div className="font-display font-bold text-2xl text-amber-500">{stats.dueCount}</div>
              <div className="text-xs text-zinc-500">Do powtórki</div>
            </div>
            <div className="stat-card text-center">
              <div className="font-display font-bold text-2xl">{stats.totalCards}</div>
              <div className="text-xs text-zinc-500">Łącznie kart</div>
            </div>
            <div className="stat-card text-center">
              <div className="font-display font-bold text-2xl text-brand-500">{stats.masteredCount}</div>
              <div className="text-xs text-zinc-500">Opanowane</div>
            </div>
          </div>
        )}

        {cards.length > 0 ? (
          <button onClick={() => setPhase('review')} className="btn-primary w-full py-4">
            Rozpocznij powtórkę ({cards.length} kart)
          </button>
        ) : (
          <div className="glass-card p-8 text-center">
            <p className="text-zinc-500">Brak kart do powtórki. Rozwiąż kilka pytań, aby wygenerować karty.</p>
            <a href="/dashboard/sesja" className="btn-secondary mt-4 inline-flex">Nowa sesja</a>
          </div>
        )}
      </div>
    );
  }

  // Review phase
  const card = cards[currentIndex];
  const question = card?.question;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">Karta {currentIndex + 1} z {cards.length}</span>
        <span className="text-xs text-zinc-400">Interwał: {card.interval}d · EF: {card.easeFactor}</span>
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${((currentIndex) / cards.length) * 100}%` }} />
      </div>

      <div className="glass-card p-8 min-h-[200px] flex flex-col justify-center animate-slide-up" key={card.cardId}>
        {question && (
          <>
            <span className="text-xs text-zinc-400 mb-3">{question.topic?.name}</span>
            <h3 className="font-display font-semibold text-lg">{question.content?.question}</h3>

            {!showAnswer ? (
              <button onClick={() => setShowAnswer(true)} className="btn-secondary mt-6 mx-auto">
                Pokaż odpowiedź
              </button>
            ) : (
              <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700 animate-slide-up">
                {question.type === 'CLOSED' && (
                  <p className="text-sm"><strong>Odpowiedź:</strong> {question.content?.correctAnswer} — {question.content?.options?.find((o: any) => o.id === question.content.correctAnswer)?.text}</p>
                )}
                {question.type === 'OPEN' && question.content?.sampleAnswer && (
                  <p className="text-sm">{question.content.sampleAnswer}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showAnswer && (
        <div className="animate-slide-up">
          <p className="text-xs text-zinc-500 text-center mb-3">Jak dobrze pamiętałeś?</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { q: 0, label: 'Nie pamiętam', color: 'bg-red-500' },
              { q: 2, label: 'Trudno', color: 'bg-orange-500' },
              { q: 3, label: 'Dobrze', color: 'bg-amber-500' },
              { q: 5, label: 'Idealnie', color: 'bg-brand-500' },
            ].map((opt) => (
              <button
                key={opt.q}
                onClick={() => rateCard(opt.q)}
                className={`${opt.color} text-white py-3 rounded-2xl text-xs font-semibold hover:opacity-90 transition`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
