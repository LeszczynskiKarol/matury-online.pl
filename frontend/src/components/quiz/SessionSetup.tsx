import { useState, useEffect } from 'react';
import { subjects as subjectsApi } from '../../lib/api';
import { QuizPlayer } from './QuizPlayer';

type Step = 'select' | 'playing';

export function SessionSetup() {
  const [step, setStep] = useState<Step>('select');
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>(undefined);
  const [maturaLevel, setMaturaLevel] = useState<'podstawowa' | 'rozszerzona' | 'all'>('all');
  const [sessionType, setSessionType] = useState('ADAPTIVE');
  const [questionCount, setQuestionCount] = useState(10);

  useEffect(() => {
    subjectsApi.list().then(setAllSubjects).catch(console.error);
  }, []);

  // Map matura level to difficulty range for backend
  const difficultyRange = maturaLevel === 'podstawowa' ? 2 : maturaLevel === 'rozszerzona' ? 4 : undefined;

  if (step === 'playing' && selectedSubject) {
    return (
      <QuizPlayer
        subjectId={selectedSubject.id}
        sessionType={sessionType}
        topicId={selectedTopic}
        questionCount={questionCount}
        difficulty={difficultyRange}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-2xl mb-2">Nowa sesja nauki</h1>
        <p className="text-zinc-500">Wybierz przedmiot i typ sesji, a system dobierze pytania.</p>
      </div>

      {/* Subject selection */}
      <div>
        <h2 className="font-display font-semibold text-sm mb-3">1. Wybierz przedmiot</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {allSubjects.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSelectedSubject(s); setSelectedTopic(undefined); }}
              className={`subject-card p-4 text-center text-sm ${selectedSubject?.id === s.id ? 'ring-2 ring-brand-500' : ''}`}
            >
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="font-display font-semibold text-xs">{s.name}</div>
              <div className="text-[10px] text-zinc-500 mt-1">{s._count?.questions || 0} pytań</div>
            </button>
          ))}
        </div>
      </div>

      {/* Topic selection (if subject chosen) */}
      {selectedSubject && selectedSubject.topics?.length > 0 && (
        <div className="animate-slide-up">
          <h2 className="font-display font-semibold text-sm mb-3">2. Wybierz temat (opcjonalnie)</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTopic(undefined)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!selectedTopic ? 'bg-navy-500 text-white' : 'bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-400'}`}
            >
              Wszystkie tematy
            </button>
            {selectedSubject.topics.map((t: any) => (
              <button
                key={t.id}
                onClick={() => setSelectedTopic(t.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedTopic === t.id ? 'bg-navy-500 text-white' : 'bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-400'}`}
              >
                {t.name}
                <span className="ml-1 text-xs opacity-60">({t.questionCount})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Matura level */}
      {selectedSubject && (
        <div className="animate-slide-up" style={{ animationDelay: '50ms' }}>
          <h2 className="font-display font-semibold text-sm mb-3">3. Poziom matury</h2>
          <div className="flex gap-3">
            {[
              { val: 'podstawowa' as const, label: 'Podstawowa', desc: 'Trudność 1-3', icon: '📗' },
              { val: 'rozszerzona' as const, label: 'Rozszerzona', desc: 'Trudność 3-5', icon: '📕' },
              { val: 'all' as const, label: 'Wszystkie poziomy', desc: 'Trudność 1-5', icon: '📚' },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => setMaturaLevel(opt.val)}
                className={`flex-1 option-card flex-col items-center text-center ${maturaLevel === opt.val ? 'selected' : ''}`}
              >
                <span className="text-2xl mb-1">{opt.icon}</span>
                <span className="font-display font-semibold text-sm">{opt.label}</span>
                <span className="text-[10px] text-zinc-500">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Session type */}
      {selectedSubject && (
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          <h2 className="font-display font-semibold text-sm mb-3">4. Typ sesji</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { type: 'ADAPTIVE', icon: '🎯', name: 'Adaptacyjna', desc: 'AI dobiera trudność do Twojego poziomu' },
              { type: 'PRACTICE', icon: '📝', name: 'Praktyka', desc: 'Losowe pytania z wybranego zakresu' },
              { type: 'TOPIC_DRILL', icon: '🔨', name: 'Dryl tematyczny', desc: 'Skup się na jednym temacie (Premium)' },
              { type: 'REVIEW', icon: '🧠', name: 'Powtórka SR', desc: 'Pytania do powtórki z algorytmu SM-2 (Premium)' },
            ].map((opt) => (
              <button
                key={opt.type}
                onClick={() => setSessionType(opt.type)}
                className={`option-card ${sessionType === opt.type ? 'selected' : ''}`}
              >
                <span className="text-2xl">{opt.icon}</span>
                <div>
                  <div className="font-display font-semibold text-sm">{opt.name}</div>
                  <div className="text-xs text-zinc-500">{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Question count */}
      {selectedSubject && (
        <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
          <h2 className="font-display font-semibold text-sm mb-3">5. Liczba pytań</h2>
          <div className="flex gap-2">
            {[5, 10, 15, 20, 30].map((n) => (
              <button
                key={n}
                onClick={() => setQuestionCount(n)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${questionCount === n ? 'bg-brand-500 text-white' : 'bg-zinc-100 dark:bg-surface-800'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Start */}
      {selectedSubject && (
        <div className="pt-4 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <button onClick={() => setStep('playing')} className="btn-primary text-base py-4 px-8">
            Rozpocznij sesję ({questionCount} pytań)
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
