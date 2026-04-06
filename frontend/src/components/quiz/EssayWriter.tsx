import { useState, useEffect } from 'react';
import { essays as essaysApi, subjects as subjectsApi } from '../../lib/api';

export function EssayWriter() {
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    subjectsApi.list().then(setAllSubjects).catch(console.error);
  }, []);

  const selectedSubject = allSubjects.find((s) => s.id === subjectId);

  const handleSubmit = async () => {
    if (!subjectId || !prompt.trim() || content.trim().length < 50) {
      setError('Wypełnij temat i napisz min. 50 znaków.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await essaysApi.submit({
        subjectId,
        topicId: topicId || subjectId,
        prompt,
        content,
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Błąd podczas oceny.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const { evaluation } = result;
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div className="text-center py-8">
          <div className="text-5xl mb-4">{evaluation.overallScore >= 70 ? '🎉' : evaluation.overallScore >= 40 ? '👍' : '💪'}</div>
          <h2 className="font-display font-bold text-2xl">Ocena wypracowania</h2>
          <div className="font-display font-extrabold text-5xl text-brand-500 mt-2">
            {Math.round(evaluation.overallScore)}%
          </div>
          <span className="xp-badge mt-2 inline-flex">+{result.xpEarned} XP</span>
        </div>

        {/* Criteria breakdown */}
        <div className="glass-card p-6 space-y-4">
          <h3 className="font-display font-semibold">Szczegółowa ocena</h3>
          {evaluation.criteria.map((c: any) => (
            <div key={c.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-sm font-bold">{c.score}/{c.maxScore}</span>
              </div>
              <div className="progress-bar mb-1">
                <div className="progress-bar-fill" style={{ width: `${(c.score / c.maxScore) * 100}%` }} />
              </div>
              <p className="text-xs text-zinc-500">{c.feedback}</p>
            </div>
          ))}
        </div>

        {/* Overall feedback */}
        <div className="glass-card p-6">
          <h3 className="font-display font-semibold mb-3">Ogólna ocena</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{evaluation.overallFeedback}</p>

          {evaluation.strengths?.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-brand-600 mb-2">Mocne strony:</h4>
              <ul className="space-y-1">
                {evaluation.strengths.map((s: string, i: number) => (
                  <li key={i} className="text-sm flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> {s}</li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.improvements?.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-amber-600 mb-2">Do poprawy:</h4>
              <ul className="space-y-1">
                {evaluation.improvements.map((s: string, i: number) => (
                  <li key={i} className="text-sm flex items-start gap-2"><span className="text-amber-500 mt-0.5">→</span> {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={() => { setResult(null); setContent(''); }} className="btn-outline">Napisz ponownie</button>
          <a href="/dashboard" className="btn-ghost">Wróć do dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl mb-2">Wypracowanie</h1>
        <p className="text-zinc-500">Napisz wypracowanie, a AI oceni je w ciągu 30 sekund.</p>
      </div>

      {/* Subject select */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Przedmiot</label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="input">
            <option value="">Wybierz przedmiot...</option>
            {allSubjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
        </div>
        {selectedSubject && selectedSubject.topics?.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Temat (opcjonalnie)</label>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="input">
              <option value="">Dowolny</option>
              {selectedSubject.topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Temat wypracowania</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="input resize-none"
          placeholder='np. "Czy szczęście zależy od nas samych? Rozważ problem..."'
        />
      </div>

      {/* Content */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium">Treść wypracowania</label>
          <span className={`text-xs font-mono ${wordCount >= 250 ? 'text-brand-500' : 'text-zinc-400'}`}>
            {wordCount} słów {wordCount < 250 && '(min. 250)'}
          </span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          className="input resize-y font-body leading-relaxed"
          placeholder="Zacznij pisać wypracowanie..."
        />
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">{error}</div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !subjectId || content.trim().length < 50}
        className="btn-primary disabled:opacity-40"
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            AI ocenia wypracowanie...
          </span>
        ) : (
          <>Oceń wypracowanie z AI</>
        )}
      </button>
    </div>
  );
}
