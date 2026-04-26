// ============================================================================
// ListeningSetup — dedicated Listening tab in dashboard
// frontend/src/components/quiz/ListeningSetup.tsx
//
// Supports: angielski + niemiecki
// Uses existing ListeningSession flow via QuizPlayer with LISTENING type
// ============================================================================

import { useState, useEffect } from "react";
import { subjects as subjectsApi, stripe as stripeApi } from "../../lib/api";
import { QuizPlayer } from "./QuizPlayer";

interface SubjectOption {
  id: string;
  slug: string;
  name: string;
  icon: string;
  topics?: { id: string; name: string; slug: string; questionCount: number }[];
}

const LISTENING_SUBJECTS = ["angielski", "niemiecki"];

export function ListeningSetup() {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selected, setSelected] = useState<SubjectOption | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>(
    undefined,
  );
  const [questionCount, setQuestionCount] = useState(5);
  const [playing, setPlaying] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);

  useEffect(() => {
    stripeApi
      .status()
      .then((s) => setIsPremium(s.isPremium))
      .catch(() => setIsPremium(false));
  }, []);

  useEffect(() => {
    subjectsApi
      .list()
      .then((all) => {
        const listening = all.filter((s: any) =>
          LISTENING_SUBJECTS.includes(s.slug),
        );
        setSubjects(listening);
        // Auto-select if only one or preselect from URL
        const params = new URLSearchParams(window.location.search);
        const pre = params.get("jezyk");
        if (pre) {
          const match = listening.find((s: any) => s.slug === pre);
          if (match) setSelected(match);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (playing) window.scrollTo({ top: 0, behavior: "instant" });
  }, [playing]);

  if (playing && selected) {
    return (
      <QuizPlayer
        subjectId={selected.id}
        sessionType="PRACTICE"
        questionCount={questionCount}
        topicId={selectedTopic}
        questionTypes={["LISTENING"]}
      />
    );
  }

  const formContent = (
    <div className="space-y-10">
      {/* 1. Język */}
      <div>
        <h2 className="font-display font-semibold text-sm mb-3">
          1. Wybierz język
        </h2>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelected(s);
                setSelectedTopic(undefined);
              }}
              className={`relative overflow-hidden rounded-2xl p-6 text-center transition-all duration-200 border-2 ${
                selected?.id === s.id
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-900/15 shadow-lg shadow-brand-500/10"
                  : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-surface-800 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md"
              }`}
            >
              <div className="text-4xl mb-3">{s.icon}</div>
              <div className="font-display font-bold text-base">{s.name}</div>
              <div className="text-[10px] text-zinc-400 mt-1">
                {s.slug === "angielski" ? "English listening" : "Hörverstehen"}
              </div>
              {selected?.id === s.id && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                  <svg
                    className="w-3.5 h-3.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Temat (opcjonalnie) */}
      {selected && selected.topics && selected.topics.length > 0 && (
        <div className="animate-slide-up">
          <h2 className="font-display font-semibold text-sm mb-3">
            2. Temat (opcjonalnie)
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTopic(undefined)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                !selectedTopic
                  ? "bg-navy-500 text-white"
                  : "bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-400"
              }`}
            >
              Wszystkie tematy
            </button>
            {selected.topics.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTopic(t.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedTopic === t.id
                    ? "bg-navy-500 text-white"
                    : "bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {t.name.replace(/^[IVXLCDM]+\.\s*/, "")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Liczba nagrań */}
      {selected && (
        <div className="animate-slide-up" style={{ animationDelay: "50ms" }}>
          <h2 className="font-display font-semibold text-sm mb-3">
            {selected.topics && selected.topics.length > 0 ? "3" : "2"}. Liczba
            nagrań
          </h2>
          <div className="flex gap-2">
            {[3, 5, 7, 10].map((n) => (
              <button
                key={n}
                onClick={() => setQuestionCount(n)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  questionCount === n
                    ? "bg-brand-500 text-white shadow-md shadow-brand-500/25"
                    : "bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-surface-700"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">
            Każde nagranie zużywa ~4 kredyty AI
          </p>
        </div>
      )}

      {/* Start */}
      {selected && (
        <div
          className="animate-slide-up pt-2"
          style={{ animationDelay: "100ms" }}
        >
          <button
            onClick={() => setPlaying(true)}
            className="btn-primary text-base py-4 px-8"
          >
            🎧 Rozpocznij listening ({questionCount} nagrań)
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Info */}
      <div className="grid sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🤖</span>
          <div>
            <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              AI generuje nagrania
            </div>
            <div className="text-[11px] text-zinc-400">
              Każde nagranie jest unikalne — Claude pisze transkrypt, Google TTS
              syntezuje głos
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Prefetch w tle
            </div>
            <div className="text-[11px] text-zinc-400">
              Pierwsze nagranie ~15s, kolejne ładują się w tle — zero czekania
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-2xl">🎯</span>
          <div>
            <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Format maturalny
            </div>
            <div className="text-[11px] text-zinc-400">
              Dialogi, monologi, wywiady — P/F, MCQ, uzupełnianie luk
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-2xl mb-2">🎧 Słuchanie</h1>
        <p className="text-zinc-500">
          Ćwicz rozumienie ze słuchu — AI generuje unikalne nagrania i pytania w
          czasie rzeczywistym.
        </p>
      </div>

      {isPremium === false ? (
        <div>
          <div className="opacity-30 pointer-events-none select-none">
            {formContent}
          </div>
          <div className="text-center p-8 mt-6 rounded-3xl bg-white dark:bg-surface-900 border-2 border-brand-200 dark:border-brand-800/30 shadow-xl max-w-md mx-auto">
            <span className="text-5xl block mb-4">🔒</span>
            <h2 className="font-display font-bold text-xl mb-2">
              Dostęp tylko dla Premium
            </h2>
            <p className="text-sm text-zinc-500 mb-6">
              Tryb słuchania wymaga kredytów AI. Wykup subskrypcję, aby uzyskać
              dostęp.
            </p>
            <a
              href="/dashboard/subskrypcja"
              className="btn-primary text-base py-3 px-8"
            >
              Przejdź na Premium — 49 zł/mies.
            </a>
          </div>
        </div>
      ) : (
        formContent
      )}
    </div>
  );
}
