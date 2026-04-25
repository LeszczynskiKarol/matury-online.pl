import { useState, useEffect, useRef } from "react";
import {
  subjects as subjectsApi,
  stripe as stripeApi,
  dashboard as dashboardApi,
} from "../../lib/api";
import { QuizPlayer } from "./QuizPlayer";

interface SessionCategory {
  label: string;
  icon: string;
  types: string[];
  desc: string;
}

const SUBJECT_CATEGORIES: Record<string, SessionCategory[]> = {
  niemiecki: [
    {
      label: "Pisanie",
      icon: "✎",
      types: ["OPEN"],
      desc: "Pytania otwarte, e-maile, wypowiedzi",
    },
    {
      label: "Testy i quizy",
      icon: "◉",
      types: ["CLOSED", "MULTI_SELECT", "TRUE_FALSE", "FILL_IN", "MATCHING"],
      desc: "Gramatyka, słownictwo, Sprachmittel",
    },
    {
      label: "Praca z tekstem",
      icon: "◫",
      types: ["TABLE_DATA"],
      desc: "Leseverstehen — analiza tekstów",
    },
    {
      label: "Słuchanie",
      icon: "🎧",
      types: ["LISTENING"],
      desc: "AI generuje nagrania w czasie rzeczywistym",
    },
  ],
  informatyka: [
    {
      label: "Pisanie",
      icon: "✎",
      types: ["OPEN"],
      desc: "Algorytmy, pseudokod, wyjaśnienia",
    },
    {
      label: "Testy i quizy",
      icon: "◉",
      types: ["CLOSED", "MULTI_SELECT", "TRUE_FALSE", "FILL_IN", "MATCHING"],
      desc: "Zamknięte, uzupełnianie, dopasowania",
    },
    {
      label: "Obliczenia",
      icon: "🧮",
      types: ["CALCULATION"],
      desc: "Systemy liczbowe, złożoność, obliczenia",
    },
    {
      label: "Dane i wykresy",
      icon: "🗺",
      types: ["TABLE_DATA", "GRAPH_INTERPRET"],
      desc: "Tabele, wykresy, analiza danych",
    },
  ],
  polski: [
    {
      label: "Pisanie",
      icon: "✎",
      types: ["OPEN", "ESSAY"],
      desc: "Pytania otwarte i wypracowania",
    },
    {
      label: "Testy i quizy",
      icon: "◉",
      types: [
        "CLOSED",
        "MULTI_SELECT",
        "TRUE_FALSE",
        "FILL_IN",
        "MATCHING",
        "ORDERING",
        "ERROR_FIND",
        "CLOZE",
      ],
      desc: "Zamknięte, wyboru, łączenia, błędy",
    },
    {
      label: "Praca z tekstem",
      icon: "◫",
      types: ["WIAZKA"],
      desc: "Analiza fragmentów tekstów",
    },
  ],
  angielski: [
    {
      label: "Pisanie",
      icon: "✎",
      types: ["OPEN", "ESSAY"],
      desc: "Pytania otwarte i wypracowania",
    },
    {
      label: "Testy i quizy",
      icon: "◉",
      types: [
        "CLOSED",
        "MULTI_SELECT",
        "TRUE_FALSE",
        "FILL_IN",
        "MATCHING",
        "ORDERING",
        "ERROR_FIND",
        "CLOZE",
      ],
      desc: "Gramatyka, słownictwo, Use of English",
    },
    {
      label: "Praca z tekstem",
      icon: "◫",
      types: ["WIAZKA"],
      desc: "Reading comprehension",
    },
    {
      label: "Słuchanie",
      icon: "🎧",
      types: ["LISTENING"],
      desc: "AI generuje nagrania w czasie rzeczywistym",
    },
  ],
  wos: [
    {
      label: "Pisanie",
      icon: "✎",
      types: ["OPEN", "ESSAY"],
      desc: "Pytania otwarte i wypracowania",
    },
    {
      label: "Testy i quizy",
      icon: "◉",
      types: [
        "CLOSED",
        "MULTI_SELECT",
        "TRUE_FALSE",
        "FILL_IN",
        "MATCHING",
        "ORDERING",
        "ERROR_FIND",
        "CLOZE",
      ],
      desc: "Zamknięte, wyboru, łączenia",
    },
    {
      label: "Materiały źródłowe",
      icon: "🗺",
      types: ["WIAZKA", "TABLE_DATA", "GRAPH_INTERPRET"],
      desc: "Teksty, grafiki, mapy, tabele",
    },
  ],
  historia: [
    {
      label: "Pisanie",
      icon: "✎",
      types: ["OPEN", "ESSAY"],
      desc: "Pytania otwarte i wypracowania",
    },
    {
      label: "Testy i quizy",
      icon: "◉",
      types: [
        "CLOSED",
        "MULTI_SELECT",
        "TRUE_FALSE",
        "FILL_IN",
        "MATCHING",
        "ORDERING",
        "ERROR_FIND",
        "CLOZE",
      ],
      desc: "Zamknięte, wyboru, łączenia",
    },
    {
      label: "Materiały źródłowe",
      icon: "🗺",
      types: ["WIAZKA", "TABLE_DATA", "GRAPH_INTERPRET"],
      desc: "Teksty źródłowe, mapy, grafiki",
    },
  ],
  geografia: [
    {
      label: "Pisanie",
      icon: "✎",
      types: ["OPEN", "ESSAY"],
      desc: "Pytania otwarte i wypracowania",
    },
    {
      label: "Testy i quizy",
      icon: "◉",
      types: [
        "CLOSED",
        "MULTI_SELECT",
        "TRUE_FALSE",
        "FILL_IN",
        "MATCHING",
        "ORDERING",
        "ERROR_FIND",
        "CLOZE",
      ],
      desc: "Zamknięte, wyboru, łączenia",
    },
    {
      label: "Materiały źródłowe",
      icon: "🗺",
      types: ["WIAZKA", "TABLE_DATA", "GRAPH_INTERPRET"],
      desc: "Mapy, tabele, wykresy, dane",
    },
  ],
};

function getCategories(slug: string): SessionCategory[] {
  return SUBJECT_CATEGORIES[slug] || [];
}

type Step = "select" | "playing";

export function SessionSetup() {
  const [step, setStep] = useState<Step>("select");
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>(
    undefined,
  );
  const [maturaLevel, setMaturaLevel] = useState<
    "podstawowa" | "rozszerzona" | "all"
  >("all");
  const [questionCount, setQuestionCount] = useState(10);
  const [sessionCategory, setSessionCategory] =
    useState<SessionCategory | null>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);

  const sectionRefs = {
    topic: useRef<HTMLDivElement>(null),
    level: useRef<HTMLDivElement>(null),
    category: useRef<HTMLDivElement>(null),
    count: useRef<HTMLDivElement>(null),
    start: useRef<HTMLDivElement>(null),
  };

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  useEffect(() => {
    stripeApi
      .status()
      .then((s) => setIsPremium(s.isPremium))
      .catch(() => setIsPremium(false));
  }, []);

  useEffect(() => {
    Promise.all([subjectsApi.list(), dashboardApi.main().catch(() => null)])
      .then(([subjects, dash]) => {
        // Sort subjects by most recent session
        if (dash?.recentSessions?.length) {
          const orderMap = new Map<string, number>();
          dash.recentSessions.forEach((s: any) => {
            if (!orderMap.has(s.subject.slug)) {
              orderMap.set(s.subject.slug, orderMap.size);
            }
          });
          subjects.sort((a: any, b: any) => {
            const aO = orderMap.get(a.slug) ?? 999;
            const bO = orderMap.get(b.slug) ?? 999;
            return aO - bO;
          });
        }
        setAllSubjects(subjects);
        const params = new URLSearchParams(window.location.search);
        const preselect = params.get("przedmiot");
        if (preselect) {
          const match = subjects.find((s: any) => s.slug === preselect);
          if (match) setSelectedSubject(match);
        }
      })
      .catch(console.error);
  }, []);

  const difficultyRange =
    maturaLevel === "podstawowa"
      ? 2
      : maturaLevel === "rozszerzona"
        ? 4
        : undefined;

  if (step === "playing" && selectedSubject) {
    return (
      <QuizPlayer
        subjectId={selectedSubject.id}
        sessionType="PRACTICE"
        topicId={selectedTopic}
        questionCount={questionCount}
        difficulty={difficultyRange}
        questionTypes={sessionCategory?.types}
      />
    );
  }

  // ── Form content (used both for premium and non-premium render) ──────
  const formContent = (
    <div className="space-y-8">
      {/* 1. Subject selection */}
      <div>
        <h2 className="font-display font-semibold text-sm mb-3">
          1. Wybierz przedmiot
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {allSubjects.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelectedSubject(s);
                setSelectedTopic(undefined);
                setSessionCategory(null);
                scrollTo(sectionRefs.topic);
              }}
              className={`subject-card p-4 text-center text-sm ${selectedSubject?.id === s.id ? "ring-2 ring-brand-500" : ""}`}
            >
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="font-display font-semibold text-xs">{s.name}</div>
              <div className="text-[10px] text-zinc-500 mt-1">
                {s._count?.questions || 0} pytań
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Topic selection */}
      {selectedSubject && selectedSubject.topics?.length > 0 && (
        <div ref={sectionRefs.topic} className="animate-slide-up">
          <h2 className="font-display font-semibold text-sm mb-3">
            2. Wybierz temat (opcjonalnie)
          </h2>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setSelectedTopic(undefined);
                scrollTo(sectionRefs.level);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!selectedTopic ? "bg-navy-500 text-white" : "bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-400"}`}
            >
              Wszystkie tematy
            </button>
            {selectedSubject.topics
              .filter(
                (t: any) =>
                  (sessionCategory?.types?.length === 1 &&
                    sessionCategory.types[0] === "LISTENING") ||
                  t.questionCount > 0,
              )
              .map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTopic(t.id);
                    scrollTo(sectionRefs.level);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedTopic === t.id ? "bg-navy-500 text-white" : "bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-400"}`}
                >
                  {t.name}
                  <span className="ml-1 text-xs opacity-60">
                    ({t.questionCount})
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* 3. Matura level */}
      {selectedSubject && (
        <div
          ref={sectionRefs.level}
          className="animate-slide-up"
          style={{ animationDelay: "50ms" }}
        >
          <h2 className="font-display font-semibold text-sm mb-3">
            3. Poziom matury
          </h2>
          <div className="flex gap-3">
            {[
              {
                val: "podstawowa" as const,
                label: "Podstawowa",
                desc: "Trudność 1-3",
                icon: "📗",
              },
              {
                val: "rozszerzona" as const,
                label: "Rozszerzona",
                desc: "Trudność 3-5",
                icon: "📕",
              },
              {
                val: "all" as const,
                label: "Wszystkie poziomy",
                desc: "Trudność 1-5",
                icon: "📚",
              },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => {
                  setMaturaLevel(opt.val);
                  scrollTo(sectionRefs.category);
                }}
                className={`flex-1 option-card flex-col items-center text-center ${maturaLevel === opt.val ? "selected" : ""}`}
              >
                <span className="text-2xl mb-1">{opt.icon}</span>
                <span className="font-display font-semibold text-sm">
                  {opt.label}
                </span>
                <span className="text-[10px] text-zinc-500">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Session category */}
      {selectedSubject && getCategories(selectedSubject.slug).length > 0 && (
        <div
          ref={sectionRefs.category}
          className="animate-slide-up"
          style={{ animationDelay: "100ms" }}
        >
          <h2 className="font-display font-semibold text-sm mb-3">
            4. Kategoria pytań
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => {
                setSessionCategory(null);
                scrollTo(sectionRefs.count);
              }}
              className={`option-card ${!sessionCategory ? "selected" : ""}`}
            >
              <span className="text-2xl">📚</span>
              <div>
                <div className="font-display font-semibold text-sm">
                  Wszystkie typy
                </div>
                <div className="text-xs text-zinc-500">
                  Mix wszystkich rodzajów pytań
                </div>
              </div>
            </button>
            {getCategories(selectedSubject.slug).map((cat) => (
              <button
                key={cat.label}
                onClick={() => {
                  setSessionCategory(cat);
                  scrollTo(sectionRefs.count);
                }}
                className={`option-card ${sessionCategory?.label === cat.label ? "selected" : ""}`}
              >
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <div className="font-display font-semibold text-sm">
                    {cat.label}
                  </div>
                  <div className="text-xs text-zinc-500">{cat.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5. Question count */}
      {selectedSubject && (
        <div
          ref={sectionRefs.count}
          className="animate-slide-up"
          style={{ animationDelay: "200ms" }}
        >
          <h2 className="font-display font-semibold text-sm mb-3">
            5. Liczba pytań
          </h2>
          <div className="flex gap-2">
            {[5, 10, 15, 20, 30].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setQuestionCount(n);
                  scrollTo(sectionRefs.start);
                }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${questionCount === n ? "bg-brand-500 text-white" : "bg-zinc-100 dark:bg-surface-800"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Start */}
      {selectedSubject && (
        <div
          ref={sectionRefs.start}
          className="pt-4 animate-slide-up"
          style={{ animationDelay: "300ms" }}
        >
          <button
            onClick={() => setStep("playing")}
            className="btn-primary text-base py-4 px-8"
          >
            Rozpocznij sesję ({questionCount} pytań)
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
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-2xl mb-2">
          Nowa sesja nauki
        </h1>
        <p className="text-zinc-500">
          Wybierz przedmiot i typ sesji, a system dobierze pytania.
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
              Wykup subskrypcję, aby uzyskać dostęp do wszystkich pytań, AI
              oceny i funkcji platformy.
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
