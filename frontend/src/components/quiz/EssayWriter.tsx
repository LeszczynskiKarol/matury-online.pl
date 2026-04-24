import { useState, useEffect } from "react";
import { essays as essaysApi, subjects as subjectsApi } from "../../lib/api";

type EssayLevel = "podstawowy" | "rozszerzony";

export function EssayWriter() {
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [content, setContent] = useState("");
  const [level, setLevel] = useState<EssayLevel>("podstawowy");
  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hints, setHints] = useState<string[]>([]);
  const [viewingEssay, setViewingEssay] = useState<any>(null);
  const [viewingLoading, setViewingLoading] = useState(false);

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const [isPremium, setIsPremium] = useState<boolean | null>(null);

  useEffect(() => {
    import("../../lib/api").then(({ stripe }) =>
      stripe
        .status()
        .then((s) => setIsPremium(s.isPremium))
        .catch(() => setIsPremium(false)),
    );
  }, []);

  useEffect(() => {
    subjectsApi.list().then(setAllSubjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (isPremium) {
      setHistoryLoading(true);
      essaysApi
        .history({ limit: 10 })
        .then(setHistory)
        .catch(console.error)
        .finally(() => setHistoryLoading(false));
    }
  }, [isPremium, result]);

  const selectedSubject = allSubjects.find((s) => s.id === subjectId);

  const getSubjectName = (sid: string) => {
    const s = allSubjects.find((sub) => sub.id === sid);
    return s ? `${s.icon} ${s.name}` : sid;
  };

  const handleViewEssay = async (essayId: string) => {
    setViewingLoading(true);
    try {
      const essay = await essaysApi.get(essayId);
      setViewingEssay(essay);
    } catch (err: any) {
      setError(err.message || "Nie udało się załadować wypracowania.");
    } finally {
      setViewingLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!subjectId || !prompt.trim() || content.trim().length < 50) {
      setError("Wypełnij temat i napisz min. 50 znaków.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await essaysApi.submit({
        subjectId,
        topicId: topicId || subjectId,
        prompt,
        content,
        level,
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Błąd podczas oceny.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuggestTopic = async () => {
    if (!subjectId) {
      setError("Najpierw wybierz przedmiot.");
      return;
    }
    setSuggesting(true);
    setError("");
    try {
      const res = await essaysApi.suggestTopic({
        subjectId,
        topicId: topicId || undefined,
        level,
      });
      setPrompt(res.topic);
      setHints(res.hints || []);
    } catch (err: any) {
      setError(err.message || "Błąd podczas generowania tematu.");
    } finally {
      setSuggesting(false);
    }
  };

  // ── Premium gate ─────────────────────────────────────────────────────
  if (isPremium === false) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="font-display font-bold text-2xl mb-2">Wypracowania</h1>
          <p className="text-zinc-500">
            Napisz wypracowanie, a AI oceni je w ciągu 30 sekund.
          </p>
        </div>
        <div className="text-center p-8 rounded-3xl bg-white dark:bg-surface-900 border-2 border-brand-200 dark:border-brand-800/30 shadow-xl max-w-md mx-auto">
          <span className="text-5xl block mb-4">🔒</span>
          <h2 className="font-display font-bold text-xl mb-2">
            Dostęp tylko dla Premium
          </h2>
          <p className="text-sm text-zinc-500 mb-6">
            Wykup subskrypcję, aby uzyskać dostęp do AI oceny wypracowań.
          </p>
          <a
            href="/dashboard/subskrypcja"
            className="btn-primary text-base py-3 px-8"
          >
            Przejdź na Premium — 49 zł/mies.
          </a>
        </div>
      </div>
    );
  }

  // ── Shared evaluation renderer ───────────────────────────────────────
  const renderEvaluation = (
    evaluation: any,
    essayPrompt: string,
    essayContent: string | null,
    xpEarned: number | null,
    onBack: () => void,
    backLabel: string,
  ) => (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="text-center py-8">
        <div className="text-5xl mb-4">
          {evaluation.overallScore >= 70
            ? "🎉"
            : evaluation.overallScore >= 40
              ? "👍"
              : "💪"}
        </div>
        <h2 className="font-display font-bold text-2xl">Ocena wypracowania</h2>
        <div className="font-display font-extrabold text-5xl text-brand-500 mt-2">
          {Math.round(evaluation.overallScore)}%
        </div>
        {xpEarned !== null && xpEarned > 0 && (
          <span className="xp-badge mt-2 inline-flex">+{xpEarned} XP</span>
        )}
      </div>

      <div className="glass-card p-4">
        <h4 className="text-xs font-semibold text-zinc-400 mb-1">Temat</h4>
        <p className="text-sm">{essayPrompt}</p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h3 className="font-display font-semibold">Szczegółowa ocena</h3>
        {evaluation.criteria.map((c: any) => (
          <div key={c.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{c.name}</span>
              <span className="text-sm font-bold">
                {c.score}/{c.maxScore}
              </span>
            </div>
            <div className="progress-bar mb-1">
              <div
                className="progress-bar-fill"
                style={{ width: `${(c.score / c.maxScore) * 100}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500">{c.feedback}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-6">
        <h3 className="font-display font-semibold mb-3">Ogólna ocena</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {evaluation.overallFeedback}
        </p>

        {evaluation.strengths?.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-brand-600 mb-2">
              Mocne strony:
            </h4>
            <ul className="space-y-1">
              {evaluation.strengths.map((s: string, i: number) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-brand-500 mt-0.5">✓</span> {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {evaluation.improvements?.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-amber-600 mb-2">
              Do poprawy:
            </h4>
            <ul className="space-y-1">
              {evaluation.improvements.map((s: string, i: number) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">→</span> {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {essayContent && (
        <details className="glass-card p-6">
          <summary className="font-display font-semibold cursor-pointer select-none">
            Treść wypracowania
          </summary>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-3 whitespace-pre-wrap leading-relaxed">
            {essayContent}
          </p>
        </details>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-outline">
          {backLabel}
        </button>
        <a href="/dashboard" className="btn-ghost">
          Wróć do dashboard
        </a>
      </div>
    </div>
  );

  // ── Viewing a past essay from history ────────────────────────────────
  if (viewingEssay) {
    return renderEvaluation(
      viewingEssay.evaluation,
      viewingEssay.prompt,
      viewingEssay.content,
      null,
      () => setViewingEssay(null),
      "← Wróć do listy",
    );
  }

  // ── Just-submitted result ────────────────────────────────────────────
  if (result?.evaluation) {
    return renderEvaluation(
      result.evaluation,
      prompt,
      null,
      result.xpEarned,
      () => {
        setResult(null);
        setContent("");
        setPrompt("");
        setHints([]);
      },
      "Napisz nowe",
    );
  }

  // ── Main form + history ──────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl mb-1">Wypracowanie</h1>
          <p className="text-zinc-500 text-sm">
            Napisz wypracowanie, a AI oceni je w ciągu 30 sekund.
          </p>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-semibold ml-auto whitespace-nowrap">
          🤖 Ocena AI ~2 kr.
        </span>
      </div>

      {/* Level toggle */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Poziom egzaminu
        </label>
        <div className="flex gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-surface-800 w-fit">
          <button
            type="button"
            onClick={() => setLevel("podstawowy")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              level === "podstawowy"
                ? "bg-white dark:bg-surface-700 shadow-sm text-brand-600 dark:text-brand-400"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Podstawowy
          </button>
          <button
            type="button"
            onClick={() => setLevel("rozszerzony")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              level === "rozszerzony"
                ? "bg-white dark:bg-surface-700 shadow-sm text-brand-600 dark:text-brand-400"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Rozszerzony
          </button>
        </div>
      </div>

      {/* Subject + topic selects */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Przedmiot</label>
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTopicId("");
            }}
            className="input"
          >
            <option value="">Wybierz przedmiot...</option>
            {allSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.name}
              </option>
            ))}
          </select>
        </div>
        {selectedSubject && selectedSubject.topics?.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Temat (opcjonalnie)
            </label>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="input"
            >
              <option value="">Dowolny</option>
              {selectedSubject.topics.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Prompt + suggest button */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium">Temat wypracowania</label>
          <button
            type="button"
            onClick={handleSuggestTopic}
            disabled={suggesting || !subjectId}
            className="text-xs font-medium text-brand-500 hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
          >
            {suggesting ? (
              <>
                <span className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                Generuję...
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                  />
                </svg>
                Podpowiedz temat
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-500 font-semibold">
                  ~1 kr.
                </span>
              </>
            )}
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="input resize-none"
          placeholder='np. "Czy szczęście zależy od nas samych? Rozważ problem..."'
        />
      </div>

      {/* Hints — shown after topic suggestion */}
      {hints.length > 0 && (
        <details className="rounded-xl bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/30 px-4 py-3 text-sm">
          <summary className="font-medium text-brand-600 dark:text-brand-400 cursor-pointer select-none">
            💡 Wskazówki do tematu
          </summary>
          <ul className="mt-2 space-y-1.5">
            {hints.map((h, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-zinc-600 dark:text-zinc-400"
              >
                <span className="text-brand-400 mt-0.5 shrink-0">→</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Content */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium">Treść wypracowania</label>
          <span
            className={`text-xs font-mono ${wordCount >= 250 ? "text-brand-500" : "text-zinc-400"}`}
          >
            {wordCount} słów {wordCount < 250 && "(min. 250)"}
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
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
          {error}
        </div>
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

      {/* ── History section ──────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="pt-8 border-t border-zinc-200 dark:border-surface-700">
          <h2 className="font-display font-semibold text-lg mb-4">
            Historia wypracowań
          </h2>
          <div className="space-y-3">
            {history.map((essay) => (
              <button
                key={essay.id}
                onClick={() => handleViewEssay(essay.id)}
                disabled={viewingLoading}
                className="glass-card p-4 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer group w-full text-left"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-display font-bold text-sm shrink-0 ${
                    essay.totalScore >= 70
                      ? "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                      : essay.totalScore >= 40
                        ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                        : "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                  }`}
                >
                  {Math.round(essay.totalScore)}%
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate group-hover:text-brand-500 transition-colors">
                    {essay.prompt}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                    <span>{getSubjectName(essay.subjectId)}</span>
                    <span>·</span>
                    <span>{essay.wordCount} słów</span>
                    <span>·</span>
                    <span>
                      {new Date(essay.createdAt).toLocaleDateString("pl-PL", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                </div>
                <svg
                  className="w-4 h-4 text-zinc-300 group-hover:text-brand-500 transition-colors shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {(historyLoading || viewingLoading) && (
        <div className="text-center text-xs text-zinc-400 py-4">
          <span className="w-4 h-4 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin inline-block mr-2" />
          {viewingLoading
            ? "Ładowanie wypracowania..."
            : "Ładowanie historii..."}
        </div>
      )}
    </div>
  );
}
