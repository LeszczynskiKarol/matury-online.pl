// ============================================================================
// ListeningSession — Live listening practice session
// frontend/src/components/quiz/ListeningSession.tsx
//
// Standalone session component for listening practice.
// Flow: Start → Loading → Listen → Answer → Next (prefetched) → ...
//
// Usage in Astro page:
//   <ListeningSession client:load subjectId="..." />
// ============================================================================

import { useState, useRef, useCallback } from "react";
import { ListeningQuestion } from "./ListeningQuestion";
import { answers as answersApi } from "../../lib/api";

const API = import.meta.env.PUBLIC_API_URL || "/api";

interface Props {
  subjectId: string;
}

type Phase =
  | "idle"
  | "loading"
  | "question"
  | "feedback"
  | "loading-next"
  | "summary";

async function apiPost(path: string, body: any) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function ListeningSession({ subjectId }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sessionId, setSessionId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [response, setResponse] = useState<any>(null);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const startTime = useRef(Date.now());

  const LOADING_MESSAGES = [
    "🎙 Preparing your listening exercise...",
    "🧠 AI is creating a unique scenario...",
    "🔊 Generating natural speech audio...",
    "📝 Almost ready — crafting questions...",
  ];

  // ── Start session ──────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setPhase("loading");
    setLoadingMessage(LOADING_MESSAGES[0]);

    // Cycle through loading messages
    let msgIdx = 0;
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[msgIdx]);
    }, 3000);

    try {
      // Retry until question with audio is ready
      let data: any = null;
      let attempts = 0;
      while (attempts < 3) {
        data = await apiPost("/listening/start", { subjectId });
        if (data.question?.content?.audioUrl) break;
        if (data.error && !data.retry) {
          alert(data.error);
          setPhase("idle");
          return;
        }
        attempts++;
        await new Promise((r) => setTimeout(r, 2000));
        setLoadingMessage("🔄 Finalizing audio...");
      }

      if (!data?.question?.content?.audioUrl) {
        clearInterval(msgInterval);
        alert("Could not generate audio. Try again.");
        setPhase("idle");
        return;
      }

      clearInterval(msgInterval);

      if (data.error) {
        alert(data.error);
        setPhase("idle");
        return;
      }

      setSessionId(data.sessionId);
      setCurrentQuestion(data.question);
      setQuestionCount(1);
      setPhase("question");
      startTime.current = Date.now();
    } catch (err: any) {
      clearInterval(msgInterval);
      alert("Failed to start session: " + err.message);
      setPhase("idle");
    }
  }, [subjectId]);

  // ── Submit answer ──────────────────────────────────────────────────────
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

      setFeedbackData(result);
      setResults((p) => [...p, result]);
      setTotalXp((p) => p + result.xpEarned);
      setPhase("feedback");
    } catch (err: any) {
      if (err.code === "DAILY_LIMIT") {
        alert("Osiągnięto dzienny limit pytań (5). Przejdź na Premium.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [currentQuestion, response, sessionId, submitting]);

  // ── Next question (prefetched — should be instant) ─────────────────────
  const nextQuestion = useCallback(async () => {
    setPhase("loading-next");
    setLoadingMessage("⏳ Loading next question...");

    try {
      const data = await apiPost("/listening/next", {
        sessionId,
        subjectId,
      });

      if (data.error) {
        alert(data.error);
        setPhase("summary");
        return;
      }

      setCurrentQuestion(data.question);
      setResponse(null);
      setFeedbackData(null);
      setQuestionCount((c) => c + 1);
      setPhase("question");
      startTime.current = Date.now();
    } catch (err) {
      alert("Failed to load next question");
      setPhase("summary");
    }
  }, [sessionId, subjectId]);

  // ── End session ────────────────────────────────────────────────────────
  const endSession = useCallback(async () => {
    await apiPost("/listening/end", { sessionId }).catch(() => {});
    setPhase("summary");
  }, [sessionId]);

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════

  // ── Idle: start button ─────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="max-w-lg mx-auto text-center py-16 animate-fade-in">
        <div className="text-6xl mb-6">🎧</div>
        <h2 className="font-display font-bold text-2xl mb-3">
          Listening Practice
        </h2>
        <p className="text-zinc-500 mb-2 text-sm">
          AI generuje unikalne nagrania i pytania w czasie rzeczywistym.
        </p>
        <p className="text-zinc-400 mb-8 text-xs">
          Każde pytanie jest inne — dostosowane do Twojego poziomu.
        </p>
        <button
          onClick={startSession}
          className="btn-primary text-base px-8 py-4"
        >
          Rozpocznij sesję listening
        </button>
      </div>
    );
  }

  // ── Loading: generating question ───────────────────────────────────────
  if (phase === "loading" || phase === "loading-next") {
    return (
      <div className="max-w-lg mx-auto text-center py-20 animate-fade-in">
        <div className="relative w-20 h-20 mx-auto mb-8">
          {/* Pulsing ring */}
          <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 animate-ping" />
          <div className="absolute inset-0 rounded-full border-4 border-blue-500/40 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 animate-pulse">
          {loadingMessage}
        </p>
        {phase === "loading" && (
          <p className="text-xs text-zinc-400 mt-3">
            Pierwsze pytanie zajmuje ~10 sekund. Kolejne będą natychmiastowe.
          </p>
        )}
      </div>
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────
  if (phase === "summary") {
    const correct = results.filter((r) => r.isCorrect).length;
    const accuracy =
      results.length > 0 ? Math.round((correct / results.length) * 100) : 0;

    return (
      <div className="max-w-lg mx-auto text-center py-12 animate-scale-in">
        <div className="text-6xl mb-6">
          {accuracy >= 80 ? "🎉" : accuracy >= 50 ? "👍" : "💪"}
        </div>
        <h2 className="font-display font-bold text-2xl mb-2">
          Sesja zakończona!
        </h2>
        <p className="text-zinc-500 mb-8">
          {correct} z {results.length} poprawnych
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
            onClick={() => {
              setPhase("idle");
              setResults([]);
              setTotalXp(0);
            }}
            className="btn-primary"
          >
            Kolejna sesja
          </button>
        </div>
      </div>
    );
  }

  // ── Question / Feedback ────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-500">Pytanie {questionCount}</span>
          <div className="flex items-center gap-3">
            <span className="xp-badge">+{totalXp} XP</span>
            <button
              onClick={endSession}
              className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              Zakończ
            </button>
          </div>
        </div>
      </div>

      {/* Topic & meta */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-medium text-zinc-500 bg-zinc-100 dark:bg-surface-800 px-3 py-1 rounded-full">
          {currentQuestion?.topic?.name || "Listening"}
        </span>
        <DifficultyDots level={currentQuestion?.difficulty || 2} />
        <span className="text-[10px] text-zinc-400 ml-auto uppercase tracking-wide">
          🎧 Listening
        </span>
      </div>

      {/* Question card */}
      <div
        className="glass-card p-8 mb-6 animate-slide-up"
        key={currentQuestion?.id}
      >
        <ListeningQuestion
          content={currentQuestion?.content}
          response={response}
          onChange={setResponse}
          disabled={phase === "feedback"}
          feedback={feedbackData}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        {phase === "question" ? <div /> : <div />}
        <div className="flex gap-3">
          {phase === "question" && (
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
          )}
          {phase === "feedback" && (
            <div className="flex gap-3">
              <button onClick={endSession} className="btn-ghost text-sm">
                Zakończ sesję
              </button>
              <button onClick={nextQuestion} className="btn-primary">
                Następne pytanie →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DifficultyDots({ level }: { level: number }) {
  return (
    <div className="flex gap-1" title={`Trudność: ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i <= level ? "bg-brand-500" : "bg-zinc-200 dark:bg-zinc-700"}`}
        />
      ))}
    </div>
  );
}
