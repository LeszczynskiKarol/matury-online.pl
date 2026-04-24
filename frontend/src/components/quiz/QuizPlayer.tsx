import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { MathGraph } from "./MathGraph";
import { AdminQuestionSearch } from "./AdminQuestionSearch";
import { AdminBrowseBar, type AdminSort } from "./AdminBrowseBar";
import { auth } from "../../lib/api";
import {
  answers as answersApi,
  sessions as sessionsApi,
  questions as questionsApi,
} from "../../lib/api";
import { ListeningQuestion } from "./ListeningQuestion";
import {
  DiagramLabelQuestion,
  ExperimentDesignQuestion,
  CrossPunnettQuestion,
  CalculationQuestion,
} from "./BiologyQuestions";
import { ChemText } from "./Chem";

function getCorrectAnswerLocal(type: string, content: any): any {
  switch (type) {
    case "CLOSED":
      return content.correctAnswer;
    case "MULTI_SELECT":
      return content.correctAnswers;
    case "TRUE_FALSE":
      return (
        content.statements
          ?.map(
            (s: any, i: number) =>
              `${i + 1}. ${s.text} — ${s.isTrue ? "Prawda" : "Fałsz"}`,
          )
          .join("\n") || null
      );

    case "FILL_IN":
      return (
        content.blanks
          ?.map(
            (b: any, i: number) =>
              `${b.label ? b.label.replace("___", b.acceptedAnswers?.[0]) : `Luka ${i + 1}: ${b.acceptedAnswers?.[0]}`}`,
          )
          .join("\n") || null
      );

    case "MATCHING":
      return (
        content.pairs?.map((p: any) => `${p.left} → ${p.right}`).join("\n") ||
        null
      );
    case "ORDERING":
      return (
        content.correctOrder
          ?.map((idx: number, i: number) => `${i + 1}. ${content.items?.[idx]}`)
          .join("\n") || null
      );

    case "ERROR_FIND":
      const step = content.steps?.find(
        (s: any) => s.id === content.correctErrorStep,
      );
      return step ? `Krok ${step.id}: ${step.text}` : content.correctErrorStep;

    case "CLOZE":
      return (
        Object.entries(content.blanks || {})
          .map(
            ([k, b]: [string, any], i: number) =>
              `Luka ${i + 1}: ${b.acceptedAnswers?.[0]}`,
          )
          .join("\n") || null
      );
    case "PROOF_ORDER":
      return content.correctOrder;
    case "GRAPH_INTERPRET":
    case "TABLE_DATA":
      return (
        content.subQuestions
          ?.map(
            (sq: any, i: number) => `${sq.text}: ${sq.acceptedAnswers?.[0]}`,
          )
          .join("\n") || null
      );
    case "WIAZKA":
      return (
        content.subQuestions
          ?.map((sq: any, i: number) => {
            const letter = String.fromCharCode(97 + i);
            let answer: string;

            if (sq.type === "OPEN") {
              answer =
                sq.sampleAnswer || sq.correctAnswer || "(brak wzorcowej)";
            } else if (sq.type === "MULTI_SELECT") {
              const ids = sq.correctAnswers || [];
              answer = ids
                .map((id: string) => {
                  const opt = sq.options?.find((o: any) => o.id === id);
                  return opt ? `${id}: ${opt.text}` : id;
                })
                .join(", ");
            } else if (sq.type === "CLOSED") {
              const opt = sq.options?.find(
                (o: any) => o.id === sq.correctAnswer,
              );
              answer = opt
                ? `${sq.correctAnswer}: ${opt.text}`
                : sq.correctAnswer || "—";
            } else if (sq.type === "TRUE_FALSE" && sq.statements) {
              answer = sq.statements
                .map((s: any) => (s.isTrue ? "Prawda" : "Fałsz"))
                .join(", ");
            } else if (sq.type === "FILL_IN") {
              answer =
                sq.acceptedAnswers?.[0] ||
                Object.values(sq.blanks || {})
                  .map((b: any) => b.acceptedAnswers?.[0])
                  .join(", ") ||
                "—";
            } else {
              answer =
                sq.correctAnswer ||
                sq.acceptedAnswers?.[0] ||
                sq.sampleAnswer ||
                "—";
            }

            return `${letter}) ${answer}`;
          })
          .join("\n") || null
      );
    case "OPEN":
      return content.sampleAnswer || content.rubric || null;
    case "ESSAY":
      return (
        content.sampleAnswer ||
        content.criteria
          ?.map((c: any) => `${c.name} (max ${c.maxPoints} pkt)`)
          .join(", ") ||
        null
      );
    case "CROSS_PUNNETT":
      return (
        content.questions
          ?.map(
            (q: any) =>
              `${q.label}: ${q.acceptedAnswers?.[0]}${q.unit ? ` ${q.unit}` : ""}`,
          )
          .join("\n") || null
      );

    case "CALCULATION":
      return `${content.answer?.expectedValue} ${content.answer?.unit || ""}${content.answer?.tolerance ? ` (±${content.answer.tolerance})` : ""}`;

    case "DIAGRAM_LABEL":
      return (
        content.labels
          ?.map((l: any) => `${l.id}. ${l.question}: ${l.acceptedAnswers?.[0]}`)
          .join("\n") || null
      );

    case "EXPERIMENT_DESIGN":
      return (
        content.fields
          ?.map((f: any) => `${f.label}: ${f.sampleAnswer || "(otwarte)"}`)
          .join("\n") || null
      );
    default:
      return null;
  }
}

interface Question {
  id: string;
  type: string;
  difficulty: number;
  points: number;
  content: any;
  source?: string;
  topic: { id: string; name: string; slug: string };
  myViewCount?: number;
  totalAttempts?: number;
}

interface QuizPlayerProps {
  subjectId: string;
  sessionType: string;
  topicId?: string;
  questionCount?: number;
  difficulty?: number;
  questionTypes?: string[];
}

type Phase = "loading" | "question" | "feedback" | "summary";

interface LiveFilters {
  topicIds: string[];
  types: string[];
  difficulties: number[];
  sources: string[];
}

interface FilterOptions {
  topics: { id: string; name: string; slug: string; questionCount: number }[];
  types: { type: string; count: number }[];
  difficulties: { difficulty: number; count: number }[];
  sources: { source: string; count: number }[];
  totalQuestions: number;
}

const EMPTY_FILTERS: LiveFilters = {
  topicIds: [],
  types: [],
  difficulties: [],
  sources: [],
};

const TYPE_LABELS: Record<string, string> = {
  CLOSED: "Zamknięte",
  MULTI_SELECT: "Wielokrotne",
  TRUE_FALSE: "Prawda/Fałsz",
  OPEN: "Otwarte",
  FILL_IN: "Uzupełnij",
  MATCHING: "Dopasuj",
  ORDERING: "Kolejność",
  WIAZKA: "Praca z tekstem",
  LISTENING: "Słuchanie",
  TABLE_DATA: "Tabela",
  GRAPH_INTERPRET: "Wykres",
  ERROR_FIND: "Błąd",
  CLOZE: "Luki",
  PROOF_ORDER: "Dowód",
  ESSAY: "Esej",
  DIAGRAM_LABEL: "Opis schematu",
  EXPERIMENT_DESIGN: "Projekt doświadczenia",
  CROSS_PUNNETT: "Krzyżówka",
  CALCULATION: "Obliczenia",
};

const TYPE_ICONS: Record<string, string> = {
  CLOSED: "◉",
  DIAGRAM_LABEL: "🔬",
  EXPERIMENT_DESIGN: "🧪",
  CROSS_PUNNETT: "🧬",
  CALCULATION: "🧮",
  MULTI_SELECT: "☑",
  TRUE_FALSE: "⚖",
  OPEN: "✎",
  FILL_IN: "⎵",
  MATCHING: "⇄",
  LISTENING: "🎧",
  ORDERING: "↕",
  WIAZKA: "◫",
  TABLE_DATA: "▦",
  GRAPH_INTERPRET: "📈",
  ERROR_FIND: "✗",
  CLOZE: "⎽",
  PROOF_ORDER: "∴",
  ESSAY: "📄",
};

export function QuizPlayer({
  subjectId,
  sessionType,
  topicId,
  questionCount = 10,
  difficulty,
  questionTypes,
}: QuizPlayerProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [response, setResponse] = useState<any>(null);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [filters, setFilters] = useState<LiveFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(
    null,
  );
  const [poolTotal, setPoolTotal] = useState<number | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [adminSort, setAdminSort] = useState<AdminSort>(null);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseOffset, setBrowseOffset] = useState(0);
  const [aiError, setAiError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const answeredIds = useRef<Set<string>>(new Set());
  const startTime = useRef(Date.now());

  const handleAdminBrowse = useCallback(
    (sort: AdminSort, loadedQuestions: any[], total: number) => {
      setAdminSort(sort);
      setBrowseTotal(total);
      setBrowseOffset(0);
      setQuestions(loadedQuestions);
      setCurrentIndex(0);
      setResponse(null);
      setFeedbackData(null);
      setPhase("question");
      startTime.current = Date.now();
    },
    [],
  );

  const handleAdminBrowseOff = useCallback(() => {
    setAdminSort(null);
    setBrowseTotal(0);
    setBrowseOffset(0);
    // Reload fresh smart-selected questions
    questionsApi
      .pool({ subjectId, limit: 10 })
      .then((data) => {
        data.questions.forEach((q: any) => answeredIds.current.add(q.id));
        setQuestions(data.questions);
        setCurrentIndex(0);
        setResponse(null);
        setFeedbackData(null);
        setPhase("question");
        startTime.current = Date.now();
      })
      .catch(console.error);
  }, [subjectId]);

  // Load filter options once
  useEffect(() => {
    questionsApi
      .filterOptions(subjectId)
      .then(setFilterOptions)
      .catch(console.error);
  }, [subjectId]);

  useEffect(() => {
    auth
      .me()
      .then((user) => {
        if (user?.role === "ADMIN") setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  const handleAdminSelectQuestion = useCallback(
    (question: any) => {
      answeredIds.current.add(question.id);
      setQuestions((prev) => {
        const newList = [...prev];
        newList.splice(currentIndex + 1, 0, question);
        return newList;
      });
      setCurrentIndex((i) => i + 1);
      setResponse(null);
      setFeedbackData(null);
      setPhase("question");
      startTime.current = Date.now();
    },
    [currentIndex],
  );

  // Create session on mount
  useEffect(() => {
    const init = async () => {
      // ── Special case: LISTENING-only session goes through AI live-gen ────
      const isListeningOnly =
        questionTypes?.length === 1 && questionTypes[0] === "LISTENING";

      if (isListeningOnly) {
        // Użyj dedykowanej ścieżki AI — /listening/start
        try {
          const res = await fetch(
            `${import.meta.env.PUBLIC_API_URL || "/api"}/listening/start`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subjectId, difficulty }),
            },
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw Object.assign(new Error(err.error || "Start failed"), {
              code: err.code,
              remaining: err.remaining,
            });
          }
          const data = await res.json();
          if (data.error) throw new Error(data.error);

          setSessionId(data.sessionId);
          setQuestions([data.question]); // startujemy z jednym, dociągniemy /next
          answeredIds.current.add(data.question.id);
          setPhase("question");
          startTime.current = Date.now();
          return;
        } catch (err: any) {
          if (err.code === "AI_CREDITS_EXHAUSTED") {
            setAiError({
              title: "Brak kredytów AI",
              message:
                "Wykorzystano pulę kredytów AI w tym miesiącu. Tryb słuchania oraz ocena pytań otwartych wymagają kredytów AI. Możesz dokupić nieprzepadające kredyty dodatkowe.",
            });
            return;
          }
          if (err.code === "PREMIUM_REQUIRED") {
            setAiError({
              title: "Wymagana subskrypcja Premium",
              message:
                "Tryb słuchania i ocena AI są dostępne wyłącznie dla użytkowników Premium.",
            });
            return;
          }
          console.error("Listening start error:", err);
          setAiError({
            title: "Błąd generowania",
            message:
              "Nie udało się wygenerować nagrania. Spróbuj ponownie za chwilę.",
          });
          return;
        }
      }

      // ── Standardowa ścieżka (pozostaje bez zmian) ────────────────────────
      const data = await sessionsApi.create({
        subjectId,
        type: sessionType,
        topicId,
        questionCount,
        difficulty,
      });
      setSessionId(data.sessionId);

      let loadedQuestions: any[];
      if (questionTypes && questionTypes.length > 0) {
        const filtered = await questionsApi.pool({
          subjectId,
          types: questionTypes,
          limit: questionCount,
        });
        loadedQuestions = filtered.questions;
        setPoolTotal(filtered.total);
        setFilters({ ...EMPTY_FILTERS, types: questionTypes });
      } else {
        loadedQuestions = data.questions;
      }

      loadedQuestions.forEach((q: any) => answeredIds.current.add(q.id));
      setQuestions(loadedQuestions);
      setPhase("question");
      startTime.current = Date.now();
    };
    init().catch(console.error);
  }, [subjectId, sessionType, topicId, questionCount]);

  // ── Reload questions from backend when filters change ───────────────
  const loadFilteredQuestions = useCallback(
    async (newFilters: LiveFilters) => {
      setLoadingMore(true);
      try {
        const remaining = Math.max(1, questionCount - results.length);
        const data = await questionsApi.pool({
          subjectId,
          topicIds: newFilters.topicIds,
          types: newFilters.types,
          difficulties: newFilters.difficulties,
          sources: newFilters.sources,
          exclude: [...answeredIds.current],
          limit: remaining,
        });
        // ⚠️ NIE dodawaj do answeredIds tutaj — tylko submitAnswer i skipQuestion to robią
        setQuestions(data.questions);
        setPoolTotal(data.total);
        setCurrentIndex(0);
        setResponse(null);
        setFeedbackData(null);
        if (phase === "feedback") setPhase("question");
        startTime.current = Date.now();
      } catch (err: any) {
        if (err.code === "AI_CREDITS_EXHAUSTED") {
          setAiError({
            title: "Brak kredytów AI",
            message: "Wykorzystano pulę kredytów AI.",
          });
        } else if (err.code === "PREMIUM_REQUIRED") {
          setAiError({
            title: "Wymagany Premium",
            message: "Dostęp wymaga subskrypcji Premium.",
          });
        }
      } finally {
        setLoadingMore(false);
      }
    },
    [subjectId, phase, questionCount, results.length],
  );
  const handleFiltersChange = useCallback(
    (newFilters: LiveFilters) => {
      setFilters(newFilters);
      const hasAny =
        newFilters.topicIds.length > 0 ||
        newFilters.types.length > 0 ||
        newFilters.difficulties.length > 0 ||
        newFilters.sources.length > 0;
      if (hasAny) {
        loadFilteredQuestions(newFilters);
      } else {
        // Wszystkie filtry usunięte — po prostu kontynuuj z bieżącymi pytaniami
        setPoolTotal(undefined);
      }
    },
    [loadFilteredQuestions],
  );

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPoolTotal(undefined);
  }, []);

  const hasActiveFilters =
    filters.topicIds.length > 0 ||
    filters.types.length > 0 ||
    filters.difficulties.length > 0 ||
    filters.sources.length > 0;
  const currentQuestion = questions[currentIndex];
  const isListeningOnly =
    questionTypes?.length === 1 && questionTypes[0] === "LISTENING";
  const totalForProgress = isListeningOnly ? questionCount : questionCount;
  const progress =
    totalForProgress > 0 ? (results.length / totalForProgress) * 100 : 0;

  // ── Actions ─────────────────────────────────────────────────────────
  const submitAnswer = useCallback(async () => {
    if (!currentQuestion || response === null || submitting) return;
    setSubmitting(true);
    try {
      const timeSpentMs = Date.now() - startTime.current;
      const result = await answersApi.submit({
        questionId: currentQuestion.id,
        response,
        sessionId,
        timeSpentMs,
      });
      answeredIds.current.add(currentQuestion.id);
      setFeedbackData(result);
      setResults((p) => [...p, result]);
      setTotalXp((p) => p + result.xpEarned);
      setPhase("feedback");
    } catch (err: any) {
      if (err.code === "AI_CREDITS_EXHAUSTED") {
        setAiError({
          title: "Brak kredytów AI",
          message:
            "Wykorzystano pulę kredytów AI. Ocena tego pytania wymaga kredytów. Możesz dokupić nieprzepadające kredyty dodatkowe.",
        });
      } else if (err.code === "PREMIUM_REQUIRED") {
        setAiError({
          title: "Wymagany Premium",
          message:
            "Ocena pytań otwartych przez AI jest dostępna wyłącznie dla użytkowników Premium.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [currentQuestion, response, sessionId, submitting]);

  const nextQuestion = useCallback(async () => {
    const isListeningOnly =
      questionTypes?.length === 1 && questionTypes[0] === "LISTENING";

    // ── LISTENING-only: generuj kolejne przez AI ────────────────────────
    if (isListeningOnly) {
      // Zakończ po osiągnięciu wybranego questionCount
      if (results.length >= questionCount) {
        fetch(`${import.meta.env.PUBLIC_API_URL || "/api"}/listening/end`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        }).catch(console.error);
        setPhase("summary");
        return;
      }

      // Pobierz kolejne nagranie (powinno być prefetched — zero wait)
      setLoadingMore(true);
      try {
        const res = await fetch(
          `${import.meta.env.PUBLIC_API_URL || "/api"}/listening/next`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, subjectId, difficulty }),
          },
        );
        const data = await res.json();
        if (data.error) {
          setAiError({
            title: "Błąd generowania",
            message: data.error,
          });
          return;
        }
        setQuestions((prev) => [...prev, data.question]);
        answeredIds.current.add(data.question.id);
        setCurrentIndex((i) => i + 1);
        setResponse(null);
        setFeedbackData(null);
        setPhase("question");
        startTime.current = Date.now();
      } catch (err) {
        console.error("Listening next error:", err);
        setAiError({
          title: "Błąd połączenia",
          message:
            "Nie udało się wygenerować kolejnego nagrania. Spróbuj ponownie.",
        });
      } finally {
        setLoadingMore(false);
      }
      return;
    }

    if (adminSort) {
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((i) => i + 1);
        setResponse(null);
        setFeedbackData(null);
        setPhase("question");
        startTime.current = Date.now();
      } else {
        const newOffset = browseOffset + 50;
        setBrowseOffset(newOffset);
        const qs = new URLSearchParams({
          subjectId,
          sort: adminSort,
          limit: "50",
          offset: String(newOffset),
        });
        fetch(`${import.meta.env.PUBLIC_API_URL || "/api"}/questions?${qs}`, {
          credentials: "include",
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.questions.length > 0) {
              setQuestions(data.questions);
              setCurrentIndex(0);
              setResponse(null);
              setFeedbackData(null);
              setPhase("question");
              startTime.current = Date.now();
            } else {
              setPhase("summary");
            }
          })
          .catch(console.error);
      }
      return;
    }

    // ── Standardowa logika dla pozostałych typów pytań ──────────────────
    if (currentIndex + 1 >= questions.length) {
      if (hasActiveFilters) {
        loadFilteredQuestions(filters);
        return;
      }
      sessionsApi.complete(sessionId).catch(console.error);
      setPhase("summary");
    } else {
      setCurrentIndex((i) => i + 1);
      setResponse(null);
      setFeedbackData(null);
      setPhase("question");
      startTime.current = Date.now();
    }
  }, [
    currentIndex,
    questions.length,
    sessionId,
    hasActiveFilters,
    filters,
    loadFilteredQuestions,
    questionTypes,
    subjectId,
    difficulty,
    results.length,
    questionCount,
  ]);

  const skipQuestion = useCallback(() => {
    if (!currentQuestion) return;

    // Zapisz skip w bazie — backend będzie wiedział przy następnej sesji
    questionsApi.skip(currentQuestion.id, sessionId).catch(console.error);

    answeredIds.current.add(currentQuestion.id);

    if (currentIndex + 1 >= questions.length) {
      if (hasActiveFilters) {
        loadFilteredQuestions(filters);
      } else {
        questionsApi
          .pool({
            subjectId,
            exclude: [...answeredIds.current],
            limit: 10,
          })
          .then((data) => {
            if (data.questions.length > 0) {
              setQuestions(data.questions);
              setCurrentIndex(0);
            } else {
              setPhase("summary");
            }
          })
          .catch(console.error);
      }
    } else {
      setCurrentIndex((i) => i + 1);
    }
    setResponse(null);
    setFeedbackData(null);
    startTime.current = Date.now();
  }, [
    currentQuestion,
    currentIndex,
    questions.length,
    subjectId,
    sessionId,
    hasActiveFilters,
    filters,
    loadFilteredQuestions,
  ]);

  const endSession = useCallback(() => {
    const isListeningOnly =
      questionTypes?.length === 1 && questionTypes[0] === "LISTENING";

    if (isListeningOnly) {
      // Wyczyść in-memory prefetch cache w backendzie
      fetch(`${import.meta.env.PUBLIC_API_URL || "/api"}/listening/end`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(console.error);
    } else {
      sessionsApi.complete(sessionId).catch(console.error);
    }
    setPhase("summary");
  }, [sessionId, questionTypes]);

  // Track question view — fires every time question is displayed
  useEffect(() => {
    if (!currentQuestion || phase === "loading") return;
    fetch(
      `${import.meta.env.PUBLIC_API_URL || "/api"}/questions/${currentQuestion.id}/view`,
      { method: "POST", credentials: "include" },
    )
      .then((r) => r.json())
      .then((data) => {
        // Aktualizuj viewCount w lokalnym state żeby badge się odświeżył
        if (data?.viewCount !== undefined) {
          setQuestions((prev) =>
            prev.map((q) =>
              q.id === currentQuestion.id
                ? { ...q, myViewCount: data.viewCount }
                : q,
            ),
          );
        }
      })
      .catch(() => {});
  }, [currentQuestion?.id, phase]);

  // ── Loading ─────────────────────────────────────────────────────────
  if (phase === "loading") {
    const isListeningOnly =
      questionTypes?.length === 1 && questionTypes[0] === "LISTENING";

    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
        {isListeningOnly && (
          <>
            <p className="font-display font-semibold text-sm">
              🤖 AI generuje pierwsze nagranie...
            </p>
            <p className="text-xs text-zinc-500 max-w-sm text-center">
              Claude pisze transkrypt, Google TTS syntezuje głos — zajmie ~20-30
              sekund. Kolejne nagrania pobiorą się w tle (zero czekania).
            </p>
          </>
        )}
      </div>
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────
  if (phase === "summary") {
    const submitted = results.filter((r) => !r.revealed);
    const correct = submitted.filter((r) => r.isCorrect).length;
    const accuracy =
      submitted.length > 0 ? Math.round((correct / submitted.length) * 100) : 0;
    return (
      <div className="max-w-lg mx-auto text-center py-12 animate-scale-in">
        <div className="text-6xl mb-6">
          {accuracy >= 80 ? "🎉" : accuracy >= 50 ? "👍" : "💪"}
        </div>
        <h2 className="font-display font-bold text-2xl mb-2">
          Sesja zakończona!
        </h2>
        <p className="text-zinc-500 mb-8">
          {correct} z {submitted.length} poprawnych (
          {results.length - submitted.length} podejrzanych)
        </p>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="stat-card text-center">
            <div className="text-2xl font-display font-bold text-brand-500">
              {accuracy}%
            </div>
            <div className="text-xs text-zinc-500">Celność</div>
          </div>
          <div className="stat-card text-center">
            <div className="text-2xl font-display font-bold text-navy-500">
              +{totalXp}
            </div>
            <div className="text-xs text-zinc-500">XP</div>
          </div>
          <div className="stat-card text-center">
            <div className="text-2xl font-display font-bold">
              {results.length}
            </div>
            <div className="text-xs text-zinc-500">Pytań</div>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <a href="/dashboard" className="btn-ghost">
            Dashboard
          </a>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Kolejna sesja
          </button>
        </div>
      </div>
    );
  }

  // ── No questions ────────────────────────────────────────────────────
  if (!currentQuestion)
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-zinc-500 mb-4">Brak pytań pasujących do filtrów.</p>
        <button onClick={clearFilters} className="btn-primary">
          Wyczyść filtry
        </button>
      </div>
    );

  // ── Quiz ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-500">
            Pytanie {results.length + 1} z {questionCount}
            {poolTotal !== undefined && (
              <span className="text-zinc-400 ml-1">(pula: {poolTotal})</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            <span className="xp-badge">+{totalXp} XP</span>
            {results.length > 0 && (
              <button
                onClick={endSession}
                className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                Zakończ
              </button>
            )}
          </div>
        </div>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {isAdmin && (
        <AdminQuestionSearch onSelectQuestion={handleAdminSelectQuestion} />
      )}

      {isAdmin && (
        <AdminBrowseBar
          subjectId={subjectId}
          active={adminSort}
          onActivate={handleAdminBrowse}
          onDeactivate={handleAdminBrowseOff}
          currentQuestion={currentQuestion}
          seenCount={
            currentQuestion?.myViewCount ?? currentQuestion?.totalAttempts ?? 0
          }
        />
      )}

      {/* ═══ LIVE FILTER BAR ═══ */}
      <LiveFilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onClear={clearFilters}
        open={filtersOpen}
        setOpen={setFiltersOpen}
        filterOptions={filterOptions}
        poolTotal={poolTotal}
        loading={loadingMore}
        isListeningOnly={isListeningOnly}
      />

      {/* Topic & meta */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-medium text-zinc-500 bg-zinc-100 dark:bg-surface-800 px-3 py-1 rounded-full">
          {currentQuestion.topic.name}
        </span>
        <DifficultyDots level={currentQuestion.difficulty} />
        <span className="text-[10px] text-zinc-400 ml-auto uppercase tracking-wide">
          {TYPE_LABELS[currentQuestion.type] || currentQuestion.type}
        </span>
        {(currentQuestion.type === "LISTENING" ||
          currentQuestion.type === "OPEN") && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-semibold ml-1">
            🤖 Ocena AI{" "}
            {currentQuestion.type === "LISTENING" ? "~4 kr." : "~1 kr."}
          </span>
        )}
      </div>

      {/* Loading overlay */}
      {loadingMore && (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="ml-2 text-sm text-zinc-500">Ładuję pytania...</span>
        </div>
      )}

      {/* Question */}
      {!loadingMore && (
        <div
          className="glass-card p-8 mb-6 animate-slide-up"
          key={currentQuestion.id}
        >
          {/* 📚 Lektura / epoka badge */}
          {(currentQuestion.content.work ||
            currentQuestion.content.epochLabel) && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-zinc-200 dark:border-zinc-700">
              {currentQuestion.content.work && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/30">
                  📚 {currentQuestion.content.work}
                </span>
              )}
              {currentQuestion.content.epochLabel && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/30">
                  {currentQuestion.content.epochLabel}
                </span>
              )}
            </div>
          )}

          <QuestionRenderer
            question={currentQuestion}
            response={response}
            onResponseChange={setResponse}
            disabled={phase === "feedback"}
            feedback={feedbackData}
          />
        </div>
      )}

      {/* Actions */}
      {!loadingMore && (
        <div className="flex justify-between">
          {phase === "question" ? (
            currentIndex + 1 >= questions.length ? (
              <button
                onClick={endSession}
                className="btn-ghost text-sm text-zinc-500"
              >
                Zakończ sesję nauki
              </button>
            ) : (
              <button
                onClick={skipQuestion}
                className="btn-ghost text-sm text-zinc-500"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  />
                </svg>
                Pomiń
              </button>
            )
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            {phase === "question" && (
              <>
                {response === null && (
                  <button
                    onClick={() => {
                      const content = currentQuestion.content;
                      const correct = getCorrectAnswerLocal(
                        currentQuestion.type,
                        content,
                      );
                      const revealData = {
                        isCorrect: false,
                        score: 0,
                        xpEarned: 0,
                        explanation:
                          currentQuestion.content.explanation ||
                          content.explanation,
                        correctAnswer: correct,
                        revealed: true,
                      };
                      setFeedbackData(revealData);
                      setResults((p) => [...p, revealData]);
                      setPhase("feedback");
                    }}
                    className="px-4 py-2.5 rounded-2xl text-sm font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-surface-800 hover:bg-zinc-200 dark:hover:bg-surface-700 transition-all"
                  >
                    Pokaż odpowiedź
                  </button>
                )}
                <button
                  onClick={submitAnswer}
                  disabled={response === null || submitting}
                  className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sprawdzam...
                    </span>
                  ) : (
                    "Sprawdź odpowiedź"
                  )}
                </button>
              </>
            )}
            {phase === "feedback" && (
              <button onClick={nextQuestion} className="btn-primary">
                Następne pytanie →
              </button>
            )}
          </div>
        </div>
      )}
      {/* ═══ AI ERROR MODAL — overlay, nie blokuje widoku ═══ */}
      {aiError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setAiError(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md rounded-3xl bg-white dark:bg-surface-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl p-8 text-center animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAiError(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-surface-800 transition-all"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-amber-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h2 className="font-display font-bold text-xl mb-2">
              {aiError.title}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              {aiError.message}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setAiError(null)}
                className="flex-1 px-5 py-3 rounded-2xl text-sm font-semibold bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-surface-700 transition-all"
              >
                Zamknij
              </button>
              <a
                href="/dashboard/subskrypcja"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-5 py-3 rounded-2xl text-sm font-semibold bg-gradient-to-r from-brand-500 to-navy-500 text-white shadow-lg shadow-brand-500/25 hover:shadow-xl hover:scale-[1.02] transition-all text-center"
              >
                Dokup kredyty AI
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// LIVE FILTER BAR — fetches from backend
// ══════════════════════════════════════════════════════════════════════════

function LiveFilterBar({
  filters,
  onFiltersChange,
  onClear,
  open,
  setOpen,
  filterOptions,
  poolTotal,
  loading,
  isListeningOnly,
}: {
  filters: LiveFilters;
  onFiltersChange: (f: LiveFilters) => void;
  onClear: () => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  filterOptions: FilterOptions | null;
  poolTotal: number | undefined;
  loading: boolean;
  isListeningOnly?: boolean;
}) {
  const hasActive =
    filters.topicIds.length > 0 ||
    filters.types.length > 0 ||
    filters.difficulties.length > 0 ||
    filters.sources.length > 0;
  const activeCount = [
    filters.topicIds.length > 0,
    filters.types.length > 0,
    filters.difficulties.length > 0,
    filters.sources.length > 0,
  ].filter(Boolean).length;
  const tog = (a: string[], v: string) =>
    a.includes(v) ? a.filter((x) => x !== v) : [...a, v];
  const togN = (a: number[], v: number) =>
    a.includes(v) ? a.filter((x) => x !== v) : [...a, v].sort();

  if (!filterOptions) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all duration-200 shadow-sm ${hasActive ? "bg-gradient-to-r from-brand-500 to-navy-500 text-white shadow-brand-500/25" : "bg-white dark:bg-surface-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 hover:border-brand-400 hover:shadow-md"}`}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filtruj
          {activeCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-white/30 text-[9px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>

        {hasActive && !open && (
          <div className="flex flex-wrap gap-1 flex-1 overflow-hidden">
            {filters.types.length > 0 && (
              <MiniChip
                label={`${filters.types.map((t) => TYPE_LABELS[t] || t).join(", ")}`}
                onClear={() => onFiltersChange({ ...filters, types: [] })}
              />
            )}
            {filters.difficulties.length > 0 && (
              <MiniChip
                label={`Poz. ${filters.difficulties.join(",")}`}
                onClear={() =>
                  onFiltersChange({ ...filters, difficulties: [] })
                }
              />
            )}
            {filters.topicIds.length > 0 && (
              <MiniChip
                label={`${filters.topicIds.length} tem.`}
                onClear={() => onFiltersChange({ ...filters, topicIds: [] })}
              />
            )}
            {filters.sources.length > 0 && (
              <MiniChip
                label={filters.sources.join("+")}
                onClear={() => onFiltersChange({ ...filters, sources: [] })}
              />
            )}
          </div>
        )}

        {hasActive && (
          <button
            onClick={onClear}
            className="text-[10px] text-zinc-400 hover:text-red-500 transition-colors ml-auto whitespace-nowrap"
          >
            ✕ Wyczyść
          </button>
        )}
        {loading && (
          <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin ml-1" />
        )}
        {poolTotal !== undefined && hasActive && !loading && (
          <span className="text-[10px] text-zinc-400 tabular-nums whitespace-nowrap">
            {poolTotal} w puli
          </span>
        )}
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${open ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="p-5 rounded-2xl bg-white/90 dark:bg-surface-800/90 backdrop-blur-lg border border-zinc-200 dark:border-zinc-700 shadow-lg shadow-zinc-200/50 dark:shadow-black/20 space-y-4">
          {/* Topics */}
          {filterOptions.topics.filter(
            (t) => isListeningOnly || t.questionCount > 0,
          ).length > 1 && (
            <FRow label="Temat" color="indigo">
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                {filterOptions.topics
                  .filter((t) => isListeningOnly || t.questionCount > 0)
                  .map((t) => (
                    <Pill
                      key={t.id}
                      active={filters.topicIds.includes(t.id)}
                      accent="indigo"
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          topicIds: tog(filters.topicIds, t.id),
                        })
                      }
                    >
                      {t.name.replace(/^[IVXLCDM]+\.\s*/, "")}
                      <span className="opacity-40 text-[9px] ml-0.5">
                        {t.questionCount}
                      </span>
                    </Pill>
                  ))}
              </div>
            </FRow>
          )}

          {/* Types */}
          {filterOptions.types.length > 1 && (
            <FRow label="Typ" color="emerald">
              <div className="flex flex-wrap gap-1.5">
                {filterOptions.types.map((t) => (
                  <Pill
                    accent="emerald"
                    key={t.type}
                    active={filters.types.includes(t.type)}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        types: tog(filters.types, t.type),
                      })
                    }
                  >
                    <span className="opacity-50 text-[10px]">
                      {TYPE_ICONS[t.type] || "?"}
                    </span>
                    {TYPE_LABELS[t.type] || t.type}
                    <span className="opacity-40 text-[9px] ml-0.5">
                      {t.count}
                    </span>
                  </Pill>
                ))}
              </div>
            </FRow>
          )}

          {/* Difficulty */}
          {filterOptions.difficulties.length > 1 && (
            <FRow label="Trudność" color="brand">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((d) => {
                  const opt = filterOptions.difficulties.find(
                    (x) => x.difficulty === d,
                  );
                  const colors = [
                    "",
                    "bg-emerald-500",
                    "bg-sky-500",
                    "bg-amber-500",
                    "bg-orange-500",
                    "bg-red-500",
                  ];
                  return (
                    <button
                      key={d}
                      onClick={() =>
                        opt &&
                        onFiltersChange({
                          ...filters,
                          difficulties: togN(filters.difficulties, d),
                        })
                      }
                      disabled={!opt}
                      className={`w-10 h-10 rounded-xl text-sm font-bold transition-all duration-150 shadow-sm ${!opt ? "opacity-15 cursor-not-allowed bg-zinc-300 dark:bg-zinc-700" : filters.difficulties.includes(d) ? `${colors[d]} text-white shadow-lg scale-105` : "bg-white dark:bg-surface-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 hover:shadow-md hover:scale-105"}`}
                    >
                      {d}
                      {opt && (
                        <span
                          className={`block text-[8px] font-normal ${filters.difficulties.includes(d) ? "text-white/70" : "text-zinc-400"}`}
                        >
                          {opt.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </FRow>
          )}

          {/* Sources */}
          {filterOptions.sources.length > 1 && (
            <FRow label="Źródło" color="amber">
              <div className="flex gap-1.5">
                {filterOptions.sources.map((s) => (
                  <Pill
                    accent="amber"
                    key={s.source}
                    active={filters.sources.includes(s.source)}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        sources: tog(filters.sources, s.source),
                      })
                    }
                  >
                    {s.source}
                    <span className="opacity-40 text-[9px] ml-0.5">
                      {s.count}
                    </span>
                  </Pill>
                ))}
              </div>
            </FRow>
          )}
        </div>
      </div>
    </div>
  );
}

function FRow({
  label,
  children,
  color = "zinc",
}: {
  label: string;
  children: React.ReactNode;
  color?: string;
}) {
  const borderColors: Record<string, string> = {
    zinc: "border-zinc-200 dark:border-zinc-700",
    indigo: "border-indigo-200 dark:border-indigo-800/40",
    emerald: "border-emerald-200 dark:border-emerald-800/40",
    amber: "border-amber-200 dark:border-amber-800/40",
    brand: "border-brand-200 dark:border-brand-800/40",
  };
  return (
    <div className="flex items-start gap-4">
      <span
        className={`text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest w-20 pt-2 flex-shrink-0 border-r-2 ${borderColors[color] || borderColors.zinc} pr-3 text-right`}
      >
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  accent = "brand",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  accent?: "brand" | "indigo" | "amber" | "emerald";
}) {
  const colors = {
    brand: {
      active: "bg-brand-500 text-white shadow-brand-500/25 ring-brand-500/30",
      hover:
        "hover:border-brand-300 hover:text-brand-600 dark:hover:text-brand-400",
    },
    indigo: {
      active:
        "bg-indigo-500 text-white shadow-indigo-500/25 ring-indigo-500/30",
      hover:
        "hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400",
    },
    amber: {
      active: "bg-amber-500 text-white shadow-amber-500/25 ring-amber-500/30",
      hover:
        "hover:border-amber-300 hover:text-amber-600 dark:hover:text-amber-400",
    },
    emerald: {
      active:
        "bg-emerald-500 text-white shadow-emerald-500/25 ring-emerald-500/30",
      hover:
        "hover:border-emerald-300 hover:text-emerald-600 dark:hover:text-emerald-400",
    },
  };
  const c = colors[accent];
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-150 ${active ? `${c.active} shadow-md scale-[1.03] ring-1` : `bg-white dark:bg-surface-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 ${c.hover} shadow-sm hover:shadow-md`}`}
    >
      {children}
    </button>
  );
}

function MiniChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 pl-2.5 pr-1.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-100/80 dark:bg-brand-900/25 text-brand-600 dark:text-brand-400">
      {label}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-brand-200 dark:hover:bg-brand-800/40"
      >
        <svg
          className="w-2 h-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ALL QUESTION RENDERERS — identical to original (compact)
// ══════════════════════════════════════════════════════════════════════════

function QuestionRenderer({
  question,
  response,
  onResponseChange,
  disabled,
  feedback,
}: {
  question: Question;
  response: any;
  onResponseChange: (v: any) => void;
  disabled: boolean;
  feedback: any;
}) {
  const { type, content } = question;
  switch (type) {
    case "DIAGRAM_LABEL":
      return (
        <DiagramLabelQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );

    case "EXPERIMENT_DESIGN":
      return (
        <ExperimentDesignQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );

    case "CROSS_PUNNETT":
      return (
        <CrossPunnettQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );

    case "CALCULATION":
      return (
        <CalculationQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "CLOZE":
      return (
        <ClozeQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "LISTENING":
      return (
        <ListeningQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "ERROR_FIND":
      return (
        <ErrorFindQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "TABLE_DATA":
      return (
        <TableDataQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "GRAPH_INTERPRET":
      return (
        <GraphInterpretQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "PROOF_ORDER":
      return (
        <ProofOrderQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "WIAZKA":
      return (
        <WiazkaQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "CLOSED":
      return (
        <ClosedQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "MULTI_SELECT":
      return (
        <MultiSelectQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "TRUE_FALSE":
      return (
        <TrueFalseQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "FILL_IN":
      return (
        <FillInQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "OPEN":
      return (
        <OpenQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "MATCHING":
      return (
        <MatchingQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "ORDERING":
      return (
        <OrderingQuestion
          content={content}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );
    case "ESSAY":
      return (
        <OpenQuestion
          content={{
            question: content.prompt || content.question,
            rubric: content.criteria
              ?.map(
                (c: any) => `${c.name} (${c.maxPoints} pkt): ${c.description}`,
              )
              .join("; "),
            ...content,
          }}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
          feedback={feedback}
        />
      );

    default:
      return <p className="text-red-500">Nieznany typ pytania: {type}</p>;
  }
}

function ClosedQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const isA = feedback !== null;
  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-4">
        <ChemText text={content.question} />
      </h3>

      {/* Kontekst / tekst źródłowy (z migracji maturapolski) */}
      {content.context && (
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800 border border-zinc-200 dark:border-zinc-700 mb-6">
          <p className="text-sm italic whitespace-pre-wrap">
            <ChemText text={content.context} />
          </p>
        </div>
      )}
      {/* Wyraz do analizy */}
      {content.word && (
        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/30 mb-6 text-center">
          <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-1">
            Wyraz:
          </p>
          <p className="text-2xl font-display font-bold text-indigo-700 dark:text-indigo-300">
            „{content.word}"
          </p>
        </div>
      )}
      {/* Autor / dzieło */}
      {(content.author || content.work) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {content.author && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium">
              ✍️ {content.author}
            </span>
          )}
          {content.work && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-medium">
              📚 {content.work}
            </span>
          )}
        </div>
      )}

      <div className="space-y-3">
        {content.options.map((o: any) => {
          let c = "option-card";
          if (response === o.id) c += " selected";
          if (isA && o.id === feedback?.correctAnswer) c += " correct";
          if (isA && response === o.id && !feedback?.isCorrect) c += " wrong";
          return (
            <button
              key={o.id}
              onClick={() =>
                !disabled && onChange(response === o.id ? null : o.id)
              }
              disabled={disabled}
              className={c + " w-full text-left"}
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-xl bg-zinc-100 dark:bg-surface-700 flex items-center justify-center text-sm font-bold">
                {o.id}
              </span>
              <span className="text-sm">
                <ChemText text={o.text} />
              </span>
              {isA && o.id === feedback?.correctAnswer && (
                <span className="ml-auto text-brand-500">✓</span>
              )}
            </button>
          );
        })}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
// ── REPLACEMENT for MultiSelectQuestion in QuizPlayer.tsx ──
// Paste this in place of the existing MultiSelectQuestion function

function MultiSelectQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const sel = (response as string[]) || [];
  const isA = feedback !== null;
  const correctSet = new Set<string>(
    feedback?.isCorrect
      ? sel // wszystko co zaznaczył user jest poprawne
      : feedback?.correctAnswer || [],
  );
  const tog = (id: string) => {
    if (disabled) return;
    onChange(
      sel.includes(id) ? sel.filter((s: string) => s !== id) : [...sel, id],
    );
  };
  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        <ChemText text={content.question} />
      </h3>
      <p className="text-xs text-zinc-500 mb-6">Wybierz wszystkie poprawne</p>
      <div className="space-y-3">
        {content.options.map((o: any) => {
          const isSelected = sel.includes(o.id);
          const isCorrectOption = correctSet.has(o.id);

          // ── Feedback states ──────────────────────────────────
          // 1. Correct + selected   → green  ✓  "Dobrze!"
          // 2. Correct + missed     → green  ✓  "Pominięto"
          // 3. Wrong   + selected   → red    ✗  "Źle"
          // 4. Wrong   + not sel    → neutral (no marker)
          const isHit = isA && isSelected && isCorrectOption;
          const isMiss = isA && !isSelected && isCorrectOption;
          const isFalsePositive = isA && isSelected && !isCorrectOption;

          let cardClass = "option-card w-full text-left";
          if (!isA && isSelected) cardClass += " selected";
          if (isHit) cardClass += " correct";
          if (isMiss) cardClass += " correct"; // show what SHOULD have been picked
          if (isFalsePositive) cardClass += " wrong";

          return (
            <button
              key={o.id}
              onClick={() => tog(o.id)}
              disabled={disabled}
              className={cardClass}
            >
              {/* Checkbox */}
              <div
                className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                  isHit
                    ? "bg-brand-500 border-brand-500"
                    : isMiss
                      ? "bg-brand-500/40 border-brand-500"
                      : isFalsePositive
                        ? "bg-red-500 border-red-500"
                        : isSelected
                          ? "bg-navy-500 border-navy-500"
                          : "border-zinc-300 dark:border-zinc-600"
                }`}
              >
                {/* ✓ for correct (hit or miss) */}
                {(isHit || isMiss) && (
                  <svg
                    className="w-3 h-3 text-white"
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
                )}
                {/* ✗ for false positive */}
                {isFalsePositive && (
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
                {/* Normal checkmark before answer */}
                {!isA && isSelected && (
                  <svg
                    className="w-3 h-3 text-white"
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
                )}
              </div>

              {/* Option text */}
              <span className="text-sm flex-1">
                <ChemText text={o.text} />
              </span>

              {/* Right-side status badge — only after feedback */}
              {isHit && (
                <span className="ml-auto flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400">
                  ✓
                </span>
              )}
              {isMiss && (
                <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                  Pominięto
                </span>
              )}
              {isFalsePositive && (
                <span className="ml-auto flex items-center gap-1 text-xs font-bold text-red-500">
                  ✗
                </span>
              )}
            </button>
          );
        })}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function TrueFalseQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as boolean[]) || content.statements.map(() => null);
  const isA = feedback !== null;
  const set = (i: number, v: boolean) => {
    if (disabled) return;
    const n = [...ans];
    n[i] = v;
    onChange(n);
  };
  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-6">
        <ChemText text={content.question} />
      </h3>
      <div className="space-y-3">
        {content.statements.map((s: any, i: number) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800"
          >
            <p className="flex-1 text-sm">
              <ChemText text={s.text} />
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => set(i, true)}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${ans[i] === true ? "bg-brand-500 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"}`}
              >
                P
              </button>
              <button
                onClick={() => set(i, false)}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${ans[i] === false ? "bg-red-500 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"}`}
              >
                F
              </button>
            </div>
          </div>
        ))}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function FillInQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as Record<string, string>) || {};
  const isA = feedback !== null;
  // correctAnswer to tablica: ["odpowiedź1", "odpowiedź2", ...]
  const correctAnswers = (feedback?.correctAnswer as string[]) || [];

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-6">
        <ChemText text={content.question} />
      </h3>
      <div className="space-y-4">
        {content.blanks.map((b: any, i: number) => {
          const userAns = (ans[b.id] || "").trim().toLowerCase();
          const correct = correctAnswers[i];
          const isCorrectBlank =
            isA &&
            b.acceptedAnswers?.some(
              (a: string) => a.toLowerCase().trim() === userAns,
            );
          return (
            <div key={b.id}>
              <label className="block text-sm font-medium mb-1.5">
                {b.label || b.hint || b.baseWord
                  ? `${i + 1}. ${b.label || b.hint || b.baseWord}`
                  : `Luka ${i + 1}`}
              </label>
              <input
                type="text"
                value={ans[b.id] || ""}
                onChange={(e) =>
                  !disabled && onChange({ ...ans, [b.id]: e.target.value })
                }
                disabled={disabled}
                className={`input ${
                  isA
                    ? isCorrectBlank
                      ? "!border-brand-500"
                      : "!border-red-500"
                    : ""
                }`}
                placeholder="Wpisz odpowiedź..."
              />
              {isA && !isCorrectBlank && correct && (
                <p className="text-xs mt-1 text-brand-600">
                  Poprawna: {correct}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function OpenQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const isA = feedback !== null;
  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        <ChemText text={content.question} />
      </h3>

      {content.rubric && (
        <p className="text-xs text-zinc-500 mb-4">
          Kryteria: <ChemText text={content.rubric} />
        </p>
      )}

      {content.hints && content.hints.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {content.hints.map((h: string, i: number) => (
            <span
              key={i}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/15 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800/30"
            >
              💡 {h}
            </span>
          ))}
        </div>
      )}

      {content.instruction && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 italic">
          {content.instruction}
        </p>
      )}

      {/* Kontekst (zdanie/fragment do analizy) */}
      {content.context && (
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800 border border-zinc-200 dark:border-zinc-700 mb-4">
          <p className="text-sm italic whitespace-pre-wrap">
            <ChemText text={content.context} />
          </p>
        </div>
      )}

      {/* Wymagania (notatka syntetyzująca) */}
      {content.requirements && content.requirements.length > 0 && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 mb-4">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">
            ✅ Wymagania:
          </p>
          <ul className="space-y-1">
            {content.requirements.map((r: string, i: number) => (
              <li
                key={i}
                className="text-xs text-emerald-600 dark:text-emerald-400"
              >
                • {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wyrazy do użycia */}
      {content.words && content.words.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {content.words.map((w: string, i: number) => (
            <span
              key={i}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30"
            >
              {w}
            </span>
          ))}
        </div>
      )}

      <textarea
        value={typeof response === "string" ? response : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={6}
        className="input resize-none"
        placeholder="Napisz odpowiedź..."
      />
      {isA && feedback?.aiGrading && (
        <div className="mt-4 p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800 animate-slide-up">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{feedback.isCorrect ? "✅" : "❌"}</span>
            <span className="font-display font-semibold text-sm">
              Wynik: {Math.round(feedback.score * 100)}%
            </span>
            <span className="xp-badge ml-auto">+{feedback.xpEarned} XP</span>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {feedback.aiGrading.feedback}
          </p>
        </div>
      )}
      {isA && !feedback?.aiGrading && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function MatchingQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const p = (response as Record<string, string>) || {};
  const isA = feedback !== null;
  const allRight = useMemo(
    () =>
      [...content.pairs.map((x: any) => x.right)].sort(
        () => Math.random() - 0.5,
      ),
    [content.pairs],
  );

  // Poprawne pary jako mapa left→right
  const correctMap = useMemo(() => {
    const m = new Map<string, string>();
    if (feedback?.correctAnswer) {
      if (Array.isArray(feedback.correctAnswer)) {
        (feedback.correctAnswer as { left: string; right: string }[]).forEach(
          (pair) => m.set(pair.left, pair.right),
        );
      }
      // string z getCorrectAnswerLocal → correctMap puste, ale feedback.isCorrect handles it
    }
    return m;
  }, [feedback?.correctAnswer]);

  const usedFor = (currentLeft: string) => {
    const used = new Set<string>();
    for (const [left, val] of Object.entries(p)) {
      if (left !== currentLeft && val) used.add(val as string);
    }
    return used;
  };

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-6">
        <ChemText text={content.question} />
      </h3>
      <div className="space-y-3">
        {content.pairs.map((pr: any) => {
          const used = usedFor(pr.left);
          const userAnswer = p[pr.left] || "";
          const correctAnswer = correctMap.get(pr.left);
          const isCorrectPair =
            feedback?.isCorrect || userAnswer === correctAnswer;
          return (
            <div key={pr.left} className="flex items-center gap-4">
              <span className="flex-1 text-sm font-medium p-3 rounded-xl bg-zinc-50 dark:bg-surface-800">
                <ChemText text={pr.left} />
              </span>
              <span className="text-zinc-400">→</span>
              <div className="flex-1">
                <select
                  value={userAnswer}
                  onChange={(e) =>
                    onChange({ ...p, [pr.left]: e.target.value })
                  }
                  disabled={disabled}
                  className={`input w-full ${
                    isA
                      ? isCorrectPair
                        ? "!border-brand-500"
                        : "!border-red-500"
                      : ""
                  }`}
                >
                  <option value="">Wybierz...</option>
                  {allRight.map((x: string) => (
                    <option key={x} value={x} disabled={used.has(x)}>
                      {x}
                    </option>
                  ))}
                </select>
                {isA && !isCorrectPair && correctAnswer && (
                  <p className="text-xs mt-1 text-brand-600">
                    Poprawna: {correctAnswer}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

function OrderingQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ord =
    (response as number[]) || content.items.map((_: any, i: number) => i);
  const mv = (i: number, d: -1 | 1) => {
    if (disabled) return;
    const n = [...ord];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    onChange(n);
  };
  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        <ChemText text={content.question} />
      </h3>
      <p className="text-xs text-zinc-500 mb-6">Ustaw w poprawnej kolejności</p>
      <div className="space-y-2">
        {ord.map((idx: number, i: number) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-surface-800"
          >
            <span className="text-xs font-bold text-zinc-400 w-6">
              {i + 1}.
            </span>
            <span className="flex-1 text-sm">
              <ChemText text={content.items[idx]} />
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => i > 0 && mv(i, -1)}
                disabled={disabled || i === 0}
                className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
                </svg>
              </button>
              <button
                onClick={() => i < ord.length - 1 && mv(i, 1)}
                disabled={disabled || i === ord.length - 1}
                className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      {feedback !== null && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function ClozeQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as Record<string, string>) || {};
  const isA = feedback !== null;
  const tmpl = () =>
    content.template
      .split(/(\{\{[^}]+\}\}|\(\d+\))/g)
      .map((p: string, i: number) => {
        const m = p.match(/\{\{(\w+)\}\}/) || p.match(/\((\d+)\)/);
        if (!m)
          return (
            <span key={i}>
              <ChemText text={p} />
            </span>
          );
        // Map (1) → "b1", (2) → "b2" etc; {{b1}} stays "b1"
        const rawId = m[1];
        const id = /^\d+$/.test(rawId) ? `b${rawId}` : rawId;
        const b = content.blanks[id] || content.blanks[rawId];
        if (!m)
          return (
            <span key={i}>
              <ChemText text={p} />
            </span>
          );

        const ok =
          isA &&
          b?.acceptedAnswers?.some(
            (a: string) =>
              a.toLowerCase().trim() ===
              (ans[id] || ans[rawId] || "").toLowerCase().trim(),
          );
        return (
          <input
            key={i}
            type="text"
            value={ans[id] || ans[rawId] || ""}
            onChange={(e) =>
              !disabled && onChange({ ...ans, [id]: e.target.value })
            }
            disabled={disabled}
            placeholder="..."
            className={`inline-block w-28 mx-1 px-2 py-1 text-sm text-center border-b-2 bg-transparent outline-none transition-all ${isA ? (ok ? "border-brand-500 text-brand-600" : "border-red-500 text-red-600") : "border-zinc-300 dark:border-zinc-600 focus:border-navy-500"}`}
          />
        );
      });
  return (
    <div>
      {content.instruction && (
        <h3 className="font-display font-semibold text-lg mb-4">
          <ChemText text={content.instruction} />
        </h3>
      )}
      <div className="text-sm leading-8 p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800">
        {tmpl()}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function ErrorFindQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const isA = feedback !== null;
  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        <ChemText text={content.question} />
      </h3>
      <p className="text-xs text-zinc-500 mb-6">Kliknij krok z błędem</p>
      <div className="space-y-2">
        {content.steps.map((s: any) => {
          const sel = response === s.id;
          const err = s.id === content.correctErrorStep;
          let c =
            "flex items-start gap-3 p-4 rounded-2xl cursor-pointer transition-all border-2 ";
          if (isA && err) c += "border-red-400 bg-red-50 dark:bg-red-900/10";
          else if (isA && sel && !err)
            c += "border-amber-400 bg-amber-50 dark:bg-amber-900/10";
          else if (sel) c += "border-navy-500 bg-navy-50 dark:bg-navy-900/10";
          else
            c +=
              "border-transparent bg-zinc-50 dark:bg-surface-800 hover:bg-zinc-100 dark:hover:bg-surface-700";
          return (
            <button
              key={s.id}
              onClick={() => !disabled && onChange(s.id)}
              disabled={disabled}
              className={c + " w-full text-left"}
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold">
                {s.id}
              </span>
              <span className="text-sm flex-1">
                <ChemText text={s.text} />
              </span>
            </button>
          );
        })}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function TableDataQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as Record<string, string>) || {};
  const isA = feedback !== null;
  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-4">
        <ChemText text={content.question} />
      </h3>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {content.table.headers.map((h: string, i: number) => (
                <th
                  key={i}
                  className="px-4 py-2 bg-zinc-100 dark:bg-surface-700 text-left font-semibold border border-zinc-200 dark:border-zinc-700"
                >
                  <ChemText text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.table.rows.map((row: string[], ri: number) => (
              <tr key={ri}>
                {row.map((cell: string, ci: number) => (
                  <td
                    key={ci}
                    className="px-4 py-2 border border-zinc-200 dark:border-zinc-700"
                  >
                    <ChemText text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-4">
        {content.subQuestions.map((sq: any) => {
          const ok =
            isA &&
            sq.acceptedAnswers.some(
              (a: string) =>
                a.toLowerCase().trim() ===
                (ans[sq.id] || "").toLowerCase().trim(),
            );
          return (
            <div key={sq.id}>
              <label className="block text-sm font-medium mb-1.5">
                <ChemText text={sq.text} />
              </label>
              <input
                type="text"
                value={ans[sq.id] || ""}
                onChange={(e) =>
                  !disabled && onChange({ ...ans, [sq.id]: e.target.value })
                }
                disabled={disabled}
                className={`input ${isA ? (ok ? "!border-brand-500" : "!border-red-500") : ""}`}
                placeholder="Odpowiedź..."
              />
              {isA && !ok && (
                <p className="text-xs mt-1 text-brand-600">
                  Poprawna: {sq.acceptedAnswers[0]}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function GraphInterpretQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as Record<string, string>) || {};
  const isA = feedback !== null;
  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-4">
        <ChemText text={content.question} />
      </h3>
      {content.graphSvg && (
        <div
          className="mb-6 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4"
          dangerouslySetInnerHTML={{ __html: content.graphSvg }}
        />
      )}
      {content.graph && !content.graphSvg && (
        <div className="mb-6">
          <MathGraph
            segments={content.graph.segments}
            points={content.graph.points}
            lines={content.graph.lines}
            circles={content.graph.circles}
            vectors={content.graph.vectors}
            areas={content.graph.areas}
            xRange={content.graph.xRange}
            yRange={content.graph.yRange}
            height={content.graph.height || 300}
          />
        </div>
      )}
      <div className="space-y-4">
        {content.subQuestions?.map((sq: any) => {
          const ok =
            isA &&
            sq.acceptedAnswers.some(
              (a: string) =>
                a.toLowerCase().trim() ===
                (ans[sq.id] || "").toLowerCase().trim(),
            );
          return (
            <div key={sq.id}>
              <label className="block text-sm font-medium mb-1.5">
                <ChemText text={sq.text} />
              </label>
              <input
                type="text"
                value={ans[sq.id] || ""}
                onChange={(e) =>
                  !disabled && onChange({ ...ans, [sq.id]: e.target.value })
                }
                disabled={disabled}
                className={`input ${isA ? (ok ? "!border-brand-500" : "!border-red-500") : ""}`}
                placeholder="Odpowiedź..."
              />
              {isA && !ok && (
                <p className="text-xs mt-1 text-brand-600">
                  Poprawna: {sq.acceptedAnswers[0]}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function ProofOrderQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ord = (response as string[]) || content.steps.map((s: any) => s.id);
  const isA = feedback !== null;
  const mv = (i: number, d: -1 | 1) => {
    if (disabled) return;
    const n = [...ord];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    onChange(n);
  };
  const sm = Object.fromEntries(content.steps.map((s: any) => [s.id, s]));
  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        <ChemText text={content.question} />
      </h3>
      <p className="text-xs text-zinc-500 mb-6">
        Ułóż kroki w poprawnej kolejności
      </p>
      <div className="space-y-2">
        {ord.map((sid: string, i: number) => {
          const ok = isA && content.correctOrder[i] === sid;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${isA ? (ok ? "bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/30" : "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30") : "bg-zinc-50 dark:bg-surface-800"}`}
            >
              <span className="text-xs font-bold text-zinc-400 w-6">
                {i + 1}.
              </span>
              <span className="flex-1 text-sm">
                <ChemText text={sm[sid]?.text || ""} />
              </span>
              {!disabled && (
                <div className="flex gap-1">
                  <button
                    onClick={() => i > 0 && mv(i, -1)}
                    disabled={i === 0}
                    className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => i < ord.length - 1 && mv(i, 1)}
                    disabled={i === ord.length - 1}
                    className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
function WiazkaQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as Record<string, any>) || {};
  const isA = feedback !== null;
  const set = (id: string, v: any) => {
    if (disabled) return;
    onChange({ ...ans, [id]: v });
  };
  return (
    <div>
      <div className="p-4 rounded-2xl bg-navy-50 dark:bg-navy-900/10 border border-navy-200 dark:border-navy-800/30 mb-6">
        <p className="text-sm font-medium whitespace-pre-line">
          <ChemText text={content.context} />
        </p>
      </div>
      <div className="space-y-6">
        {content.subQuestions.map((sq: any, i: number) => (
          <div
            key={sq.id}
            className="p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-navy-500 text-white text-xs flex items-center justify-center font-bold">
                {String.fromCharCode(97 + i)}
              </span>
              <span className="text-sm font-medium">
                <ChemText text={sq.text} />
              </span>
              <span className="ml-auto text-xs text-zinc-400">
                {sq.points} pkt
              </span>
            </div>
            {sq.type === "TRUE_FALSE" && sq.statements && (
              <div className="space-y-2">
                {sq.statements.map((st: any, si: number) => {
                  const sa =
                    (ans[sq.id] as boolean[]) || sq.statements!.map(() => null);
                  const userAnswer = sa[si];
                  const correctAnswer = st.isTrue;
                  const userWasRight = isA && userAnswer === correctAnswer;
                  const userWasWrong =
                    isA && userAnswer !== null && userAnswer !== correctAnswer;

                  return (
                    <div
                      key={si}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                        isA
                          ? userWasRight
                            ? "bg-brand-50 dark:bg-brand-900/15 border border-brand-200 dark:border-brand-800/30"
                            : userWasWrong
                              ? "bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30"
                              : "bg-white dark:bg-surface-700"
                          : "bg-white dark:bg-surface-700"
                      }`}
                    >
                      <p className="flex-1 text-xs">{st.text}</p>

                      {/* Po feedbacku: pokaż jasno co było poprawne */}
                      {isA && (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                            correctAnswer
                              ? "bg-brand-500 text-white"
                              : "bg-red-500 text-white"
                          }`}
                          title="Poprawna odpowiedź"
                        >
                          {correctAnswer ? "TRUE" : "FALSE"} ✓
                        </span>
                      )}

                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            const n = [...sa];
                            n[si] = true;
                            set(sq.id, n);
                          }}
                          disabled={disabled}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                            userAnswer === true
                              ? isA
                                ? correctAnswer
                                  ? "bg-brand-500 text-white ring-2 ring-brand-300"
                                  : "bg-red-500 text-white ring-2 ring-red-300"
                                : "bg-brand-500 text-white"
                              : "bg-zinc-200 dark:bg-zinc-600"
                          }`}
                        >
                          T
                        </button>
                        <button
                          onClick={() => {
                            const n = [...sa];
                            n[si] = false;
                            set(sq.id, n);
                          }}
                          disabled={disabled}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                            userAnswer === false
                              ? isA
                                ? !correctAnswer
                                  ? "bg-brand-500 text-white ring-2 ring-brand-300"
                                  : "bg-red-500 text-white ring-2 ring-red-300"
                                : "bg-red-500 text-white"
                              : "bg-zinc-200 dark:bg-zinc-600"
                          }`}
                        >
                          F
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {sq.type === "OPEN" && (
              <>
                <textarea
                  value={ans[sq.id] || ""}
                  onChange={(e) => set(sq.id, e.target.value)}
                  disabled={disabled}
                  rows={3}
                  className="input resize-none text-sm"
                  placeholder="Odpowiedź..."
                />
                {isA && sq.sampleAnswer && (
                  <div className="mt-2 p-3 rounded-xl bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800/30">
                    <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-1">
                      Wzorcowa odpowiedź:
                    </p>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">
                      {sq.sampleAnswer}
                    </p>
                  </div>
                )}
              </>
            )}
            {sq.type === "CLOSED" && sq.options && (
              <div className="space-y-2">
                {sq.options.map((o: any) => {
                  const userPicked = ans[sq.id] === o.id;
                  const isCorrectOpt = o.id === sq.correctAnswer;
                  let cls = "option-card w-full text-left text-sm";
                  if (!isA && userPicked) cls += " selected";
                  if (isA && isCorrectOpt) cls += " correct";
                  if (isA && userPicked && !isCorrectOpt) cls += " wrong";
                  return (
                    <button
                      key={o.id}
                      onClick={() => !disabled && set(sq.id, o.id)}
                      disabled={disabled}
                      className={cls}
                    >
                      <span className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-surface-700 flex items-center justify-center text-xs font-bold">
                        {o.id}
                      </span>
                      <span>
                        <ChemText text={o.text} />
                      </span>
                      {isA && isCorrectOpt && (
                        <span className="ml-auto text-brand-500 font-bold">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}{" "}
            {sq.type === "FILL_IN" && sq.template && (
              <div className="text-sm leading-8 p-3 rounded-xl bg-white dark:bg-surface-700">
                {sq.template
                  .split(/(\{\{[^}]+\}\})/g)
                  .map((part: string, pi: number) => {
                    const match = part.match(/\{\{(\w+)\}\}/);
                    if (!match)
                      return (
                        <span key={pi}>
                          <ChemText text={part} />
                        </span>
                      );
                    const blankId = match[1];
                    const blank = sq.blanks?.[blankId];
                    const subAns = (ans[sq.id] as Record<string, string>) || {};
                    const userVal = (subAns[blankId] || "")
                      .trim()
                      .toLowerCase();
                    const isOk =
                      isA &&
                      blank?.acceptedAnswers?.some(
                        (a: string) => a.toLowerCase().trim() === userVal,
                      );
                    return (
                      <input
                        key={pi}
                        type="text"
                        value={subAns[blankId] || ""}
                        onChange={(e) => {
                          if (disabled) return;
                          set(sq.id, {
                            ...subAns,
                            [blankId]: e.target.value,
                          });
                        }}
                        disabled={disabled}
                        placeholder="..."
                        className={`inline-block w-20 mx-1 px-2 py-1 text-sm text-center border-b-2 bg-transparent outline-none transition-all ${
                          isA
                            ? isOk
                              ? "border-brand-500 text-brand-600"
                              : "border-red-500 text-red-600"
                            : "border-zinc-300 dark:border-zinc-600 focus:border-navy-500"
                        }`}
                      />
                    );
                  })}
              </div>
            )}
            {/* FILL_IN bez template — zwykłe inputy */}
            {sq.type === "FILL_IN" && !sq.template && sq.blanks && (
              <div className="space-y-2">
                {Object.entries(sq.blanks).map(
                  ([blankId, blank]: [string, any], bi: number) => {
                    const subAns = (ans[sq.id] as Record<string, string>) || {};
                    const userVal = (subAns[blankId] || "")
                      .trim()
                      .toLowerCase();
                    const isOk =
                      isA &&
                      blank?.acceptedAnswers?.some(
                        (a: string) => a.toLowerCase().trim() === userVal,
                      );
                    return (
                      <div key={blankId}>
                        <input
                          type="text"
                          value={subAns[blankId] || ""}
                          onChange={(e) => {
                            if (disabled) return;
                            set(sq.id, {
                              ...subAns,
                              [blankId]: e.target.value,
                            });
                          }}
                          disabled={disabled}
                          className={`input text-sm ${
                            isA
                              ? isOk
                                ? "!border-brand-500"
                                : "!border-red-500"
                              : ""
                          }`}
                          placeholder={`Odpowiedź ${bi + 1}...`}
                        />
                        {isA && !isOk && blank?.acceptedAnswers?.[0] && (
                          <p className="text-xs mt-1 text-brand-600">
                            Poprawna: {blank.acceptedAnswers[0]}
                          </p>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {isA && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

function FeedbackBlock({ feedback }: { feedback: any }) {
  if (!feedback) return null;

  // "Pokaż odpowiedź" — neutralny styl, bez oceny
  if (feedback.revealed) {
    return (
      <div className="mt-6 p-4 rounded-2xl animate-slide-up bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800/30">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">💡</span>
          <span className="font-display font-semibold text-sm">
            Poprawna odpowiedź
          </span>
        </div>
        {feedback.correctAnswer && (
          <div className="text-sm text-zinc-700 dark:text-zinc-300 font-medium whitespace-pre-wrap">
            {typeof feedback.correctAnswer === "string"
              ? feedback.correctAnswer
              : Array.isArray(feedback.correctAnswer)
                ? feedback.correctAnswer.map((a: any, i: number) => (
                    <div key={i} className="mb-1">
                      {typeof a === "object"
                        ? JSON.stringify(a)
                        : `${i + 1}. ${a}`}
                    </div>
                  ))
                : JSON.stringify(feedback.correctAnswer, null, 2)}
          </div>
        )}
        {!feedback.correctAnswer && (
          <p className="text-sm text-zinc-500 italic">
            Brak wzorcowej odpowiedzi dla tego pytania.
          </p>
        )}
        {feedback.explanation && feedback.explanation.length > 10 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
            <ChemText text={feedback.explanation} />
          </p>
        )}
      </div>
    );
  }

  // Normalny feedback po sprawdzeniu
  return (
    <div
      className={`mt-6 p-4 rounded-2xl animate-slide-up ${feedback.isCorrect ? "bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/30" : "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{feedback.isCorrect ? "✅" : "❌"}</span>
          <span className="font-display font-semibold text-sm">
            {feedback.isCorrect ? "Poprawnie!" : "Niepoprawnie"}
          </span>
        </div>
        {feedback.xpEarned > 0 && feedback.isCorrect && (
          <span className="xp-badge animate-xp-pop">
            +{feedback.xpEarned} XP
          </span>
        )}
      </div>
      {feedback.explanation &&
        !feedback.explanation.startsWith("Typ dopasowania") &&
        feedback.explanation.length > 10 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
            <ChemText text={feedback.explanation} />
          </p>
        )}
      {feedback.gamification?.leveledUp && (
        <div className="mt-3 p-3 rounded-xl bg-navy-50 dark:bg-navy-900/20 border border-navy-200 dark:border-navy-800/30 animate-scale-in">
          <span className="font-display font-bold text-sm">
            🎉 Awans na poziom {feedback.gamification.subjectLevel}!
          </span>
        </div>
      )}
      {feedback.gamification?.achievements?.length > 0 && (
        <div className="mt-3 space-y-2">
          {feedback.gamification.achievements.map((a: any) => (
            <div
              key={a.slug}
              className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 animate-scale-in"
            >
              <span className="font-display font-bold text-sm">
                {a.icon} {a.name} (+{a.xpReward} XP)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function DifficultyDots({ level }: { level: number }) {
  const labels = ["", "Łatwe", "Podstawa", "Średnie", "Trudne", "Ekspert"];
  const colors = [
    "",
    "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400",
    "text-sky-600 bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400",
    "text-amber-600 bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400",
    "text-orange-600 bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400",
    "text-red-600 bg-red-100 dark:bg-red-900/20 dark:text-red-400",
  ];
  const dotColors = [
    "",
    "bg-emerald-500",
    "bg-sky-500",
    "bg-amber-500",
    "bg-orange-500",
    "bg-red-500",
  ];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${colors[level]}`}
      title={`Trudność: ${level}/5`}
    >
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${i <= level ? dotColors[level] : "bg-zinc-300 dark:bg-zinc-600"}`}
          />
        ))}
      </span>
      {labels[level]}
    </span>
  );
}
