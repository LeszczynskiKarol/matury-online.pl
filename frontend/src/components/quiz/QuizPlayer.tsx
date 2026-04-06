import { useState, useEffect, useRef, useCallback } from "react";
import { MathGraph } from "./MathGraph";
import { answers as answersApi, sessions as sessionsApi } from "../../lib/api";

interface Question {
  id: string;
  type: string;
  difficulty: number;
  points: number;
  content: any;
  topic: { id: string; name: string; slug: string };
}

interface QuizPlayerProps {
  subjectId: string;
  sessionType: string;
  topicId?: string;
  questionCount?: number;
  difficulty?: number;
}

type Phase = "loading" | "question" | "feedback" | "summary";

export function QuizPlayer({
  subjectId,
  sessionType,
  topicId,
  questionCount = 10,
  difficulty,
}: QuizPlayerProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [response, setResponse] = useState<any>(null);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const startTime = useRef(Date.now());

  // Create session on mount
  useEffect(() => {
    sessionsApi
      .create({
        subjectId,
        type: sessionType,
        topicId,
        questionCount,
        difficulty,
      })
      .then((data) => {
        setSessionId(data.sessionId);
        setQuestions(data.questions);
        setPhase("question");
        startTime.current = Date.now();
      })
      .catch(console.error);
  }, [subjectId, sessionType, topicId, questionCount]);

  const currentQuestion = questions[currentIndex];
  const progress =
    questions.length > 0 ? (currentIndex / questions.length) * 100 : 0;

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
      setResults((prev) => [...prev, result]);
      setTotalXp((prev) => prev + result.xpEarned);
      setPhase("feedback");
    } catch (err: any) {
      if (err.code === "DAILY_LIMIT") {
        alert(
          "Osiągnięto dzienny limit pytań (5). Przejdź na Premium, aby kontynuować.",
        );
      } else if (err.code === "PREMIUM_REQUIRED") {
        alert("Ta funkcja wymaga Premium.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [currentQuestion, response, sessionId, submitting]);

  const nextQuestion = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      sessionsApi.complete(sessionId).catch(console.error);
      setPhase("summary");
    } else {
      setCurrentIndex((i) => i + 1);
      setResponse(null);
      setFeedbackData(null);
      setPhase("question");
      startTime.current = Date.now();
    }
  }, [currentIndex, questions.length, sessionId]);

  const skipQuestion = useCallback(() => {
    setQuestions((prev) => {
      const updated = [...prev];
      const [skipped] = updated.splice(currentIndex, 1);
      updated.push(skipped);
      return updated;
    });
    setResponse(null);
    setFeedbackData(null);
    setPhase("question");
    startTime.current = Date.now();
  }, [currentIndex]);

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
            <div className="text-xs text-zinc-500">XP zdobyte</div>
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
            Wróć do dashboard
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

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-500">
            Pytanie {currentIndex + 1} z {questions.length}
          </span>
          <span className="xp-badge">+{totalXp} XP</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Topic & difficulty */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-medium text-zinc-500 bg-zinc-100 dark:bg-surface-800 px-3 py-1 rounded-full">
          {currentQuestion.topic.name}
        </span>
        <DifficultyDots level={currentQuestion.difficulty} />
      </div>

      {/* Question renderer */}
      <div
        className="glass-card p-8 mb-6 animate-slide-up"
        key={currentQuestion.id}
      >
        <QuestionRenderer
          question={currentQuestion}
          response={response}
          onResponseChange={setResponse}
          disabled={phase === "feedback"}
          feedback={feedbackData}
        />
      </div>

      {/* Action buttons */}
      <div className="flex justify-between">
        {phase === "question" ? (
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
        ) : (
          <div />
        )}
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
            <button onClick={nextQuestion} className="btn-primary">
              {currentIndex + 1 >= questions.length
                ? "Zakończ sesję"
                : "Następne pytanie →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Question Renderer ──────────────────────────────────────────────────────

function QuestionRenderer({
  question,
  response,
  onResponseChange,
  disabled,
  feedback,
}: {
  question: Question;
  response: any;
  onResponseChange: (val: any) => void;
  disabled: boolean;
  feedback: any;
}) {
  const { type, content } = question;

  switch (type) {
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
    default:
      return <p className="text-red-500">Nieznany typ pytania: {type}</p>;
  }
}

// ── CLOSED (single choice A/B/C/D) ────────────────────────────────────────

function ClosedQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const isAnswered = feedback !== null;

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-6">
        {content.question}
      </h3>
      <div className="space-y-3">
        {content.options.map((opt: { id: string; text: string }) => {
          let className = "option-card";
          if (response === opt.id) className += " selected";
          if (isAnswered && opt.id === feedback?.correctAnswer)
            className += " correct";
          if (isAnswered && response === opt.id && !feedback?.isCorrect)
            className += " wrong";

          return (
            <button
              key={opt.id}
              onClick={() => !disabled && onChange(opt.id)}
              disabled={disabled}
              className={className + " w-full text-left"}
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-xl bg-zinc-100 dark:bg-surface-700 flex items-center justify-center text-sm font-bold">
                {opt.id}
              </span>
              <span className="text-sm">{opt.text}</span>
              {isAnswered && opt.id === feedback?.correctAnswer && (
                <span className="ml-auto text-brand-500">✓</span>
              )}
            </button>
          );
        })}
      </div>

      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── MULTI_SELECT ───────────────────────────────────────────────────────────

function MultiSelectQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const selected = (response as string[]) || [];
  const isAnswered = feedback !== null;

  const toggle = (id: string) => {
    if (disabled) return;
    if (selected.includes(id)) {
      onChange(selected.filter((s: string) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        {content.question}
      </h3>
      <p className="text-xs text-zinc-500 mb-6">
        Wybierz wszystkie poprawne odpowiedzi
      </p>
      <div className="space-y-3">
        {content.options.map((opt: { id: string; text: string }) => {
          let className = "option-card";
          if (selected.includes(opt.id)) className += " selected";

          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              disabled={disabled}
              className={className + " w-full text-left"}
            >
              <div
                className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center ${selected.includes(opt.id) ? "bg-navy-500 border-navy-500" : "border-zinc-300 dark:border-zinc-600"}`}
              >
                {selected.includes(opt.id) && (
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
              <span className="text-sm">{opt.text}</span>
            </button>
          );
        })}
      </div>
      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── TRUE_FALSE ─────────────────────────────────────────────────────────────

function TrueFalseQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const answers = (response as boolean[]) || content.statements.map(() => null);
  const isAnswered = feedback !== null;

  const setAnswer = (index: number, value: boolean) => {
    if (disabled) return;
    const newAnswers = [...answers];
    newAnswers[index] = value;
    onChange(newAnswers);
  };

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-6">
        {content.question}
      </h3>
      <div className="space-y-3">
        {content.statements.map(
          (s: { text: string; isTrue: boolean }, i: number) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800"
            >
              <p className="flex-1 text-sm">{s.text}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setAnswer(i, true)}
                  disabled={disabled}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${answers[i] === true ? "bg-brand-500 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"}`}
                >
                  P
                </button>
                <button
                  onClick={() => setAnswer(i, false)}
                  disabled={disabled}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${answers[i] === false ? "bg-red-500 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"}`}
                >
                  F
                </button>
              </div>
            </div>
          ),
        )}
      </div>
      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── FILL_IN ────────────────────────────────────────────────────────────────

function FillInQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const answers = (response as Record<string, string>) || {};
  const isAnswered = feedback !== null;

  const setBlank = (id: string, value: string) => {
    if (disabled) return;
    onChange({ ...answers, [id]: value });
  };

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-6">
        {content.question}
      </h3>
      <div className="space-y-4">
        {content.blanks.map(
          (blank: { id: string; acceptedAnswers: string[] }, i: number) => (
            <div key={blank.id}>
              <label className="block text-sm font-medium mb-1.5">
                Luka {i + 1}
              </label>
              <input
                type="text"
                value={answers[blank.id] || ""}
                onChange={(e) => setBlank(blank.id, e.target.value)}
                disabled={disabled}
                className="input"
                placeholder="Wpisz odpowiedź..."
              />
              {isAnswered && feedback?.correctAnswer && (
                <p className="text-xs mt-1 text-brand-600">
                  Poprawna odpowiedź: {feedback.correctAnswer[i]}
                </p>
              )}
            </div>
          ),
        )}
      </div>
      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── OPEN (AI-graded) ───────────────────────────────────────────────────────

function OpenQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const isAnswered = feedback !== null;

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        {content.question}
      </h3>
      {content.rubric && (
        <p className="text-xs text-zinc-500 mb-4">Kryteria: {content.rubric}</p>
      )}
      <textarea
        value={response || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={6}
        className="input resize-none"
        placeholder="Napisz odpowiedź..."
      />

      {isAnswered && feedback?.aiGrading && (
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
          {feedback.aiGrading.correctAnswer && (
            <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
              <p className="text-xs font-semibold text-zinc-500 mb-1">
                Wzorcowa odpowiedź:
              </p>
              <p className="text-sm">{feedback.aiGrading.correctAnswer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MATCHING ───────────────────────────────────────────────────────────────

function MatchingQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const pairs = (response as Record<string, string>) || {};
  const rights = content.pairs.map((p: any) => p.right);

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-6">
        {content.question}
      </h3>
      <div className="space-y-3">
        {content.pairs.map((pair: { left: string; right: string }) => (
          <div key={pair.left} className="flex items-center gap-4">
            <span className="flex-1 text-sm font-medium p-3 rounded-xl bg-zinc-50 dark:bg-surface-800">
              {pair.left}
            </span>
            <span className="text-zinc-400">→</span>
            <select
              value={pairs[pair.left] || ""}
              onChange={(e) =>
                onChange({ ...pairs, [pair.left]: e.target.value })
              }
              disabled={disabled}
              className="input flex-1"
            >
              <option value="">Wybierz...</option>
              {rights.map((r: string) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {feedback !== null && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── ORDERING ───────────────────────────────────────────────────────────────

function OrderingQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const order =
    (response as number[]) || content.items.map((_: any, i: number) => i);

  const moveUp = (index: number) => {
    if (disabled || index === 0) return;
    const newOrder = [...order];
    [newOrder[index - 1], newOrder[index]] = [
      newOrder[index],
      newOrder[index - 1],
    ];
    onChange(newOrder);
  };

  const moveDown = (index: number) => {
    if (disabled || index === order.length - 1) return;
    const newOrder = [...order];
    [newOrder[index], newOrder[index + 1]] = [
      newOrder[index + 1],
      newOrder[index],
    ];
    onChange(newOrder);
  };

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        {content.question}
      </h3>
      <p className="text-xs text-zinc-500 mb-6">
        Ustaw elementy w poprawnej kolejności
      </p>
      <div className="space-y-2">
        {order.map((itemIndex: number, i: number) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-surface-800"
          >
            <span className="text-xs font-bold text-zinc-400 w-6">
              {i + 1}.
            </span>
            <span className="flex-1 text-sm">{content.items[itemIndex]}</span>
            <div className="flex gap-1">
              <button
                onClick={() => moveUp(i)}
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
                onClick={() => moveDown(i)}
                disabled={disabled || i === order.length - 1}
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

// ── Feedback block ─────────────────────────────────────────────────────────

function FeedbackBlock({ feedback }: { feedback: any }) {
  if (!feedback) return null;

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
        <span className="xp-badge animate-xp-pop">+{feedback.xpEarned} XP</span>
      </div>

      {feedback.explanation && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
          {feedback.explanation}
        </p>
      )}

      {/* Gamification events */}
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
                {a.icon} Osiągnięcie: {a.name} (+{a.xpReward} XP)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Difficulty dots ────────────────────────────────────────────────────────

function DifficultyDots({ level }: { level: number }) {
  return (
    <div className="flex gap-1" title={`Trudność: ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`diff-dot ${i <= level ? "active" : "inactive"}`}
        />
      ))}
    </div>
  );
}

// ── CLOZE — tekst z lukami inline ──────────────────────────────────────────

function ClozeQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const answers = (response as Record<string, string>) || {};
  const isAnswered = feedback !== null;

  const setBlank = (id: string, value: string) => {
    if (disabled) return;
    onChange({ ...answers, [id]: value });
  };

  // Render template with inline inputs
  const renderTemplate = () => {
    const parts = content.template.split(/(\{\{[^}]+\}\})/g);
    return parts.map((part: string, i: number) => {
      const match = part.match(/\{\{(\w+)\}\}/);
      if (!match) return <span key={i}>{part}</span>;

      const blankId = match[1];
      const blank = content.blanks[blankId];
      const isCorrect =
        isAnswered &&
        blank?.acceptedAnswers?.some(
          (a: string) =>
            a.toLowerCase().trim() ===
            (answers[blankId] || "").toLowerCase().trim(),
        );

      return (
        <input
          key={i}
          type="text"
          value={answers[blankId] || ""}
          onChange={(e) => setBlank(blankId, e.target.value)}
          disabled={disabled}
          placeholder={blank?.hint || "..."}
          className={`inline-block w-28 mx-1 px-2 py-1 text-sm text-center border-b-2 bg-transparent outline-none transition-all ${
            isAnswered
              ? isCorrect
                ? "border-brand-500 text-brand-600"
                : "border-red-500 text-red-600"
              : "border-zinc-300 dark:border-zinc-600 focus:border-navy-500"
          }`}
        />
      );
    });
  };

  return (
    <div>
      {content.instruction && (
        <h3 className="font-display font-semibold text-lg mb-4">
          {content.instruction}
        </h3>
      )}
      <div className="text-sm leading-8 p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800">
        {renderTemplate()}
      </div>
      {isAnswered && (
        <div className="mt-4 space-y-1">
          {Object.entries(content.blanks).map(([id, blank]: [string, any]) => (
            <p key={id} className="text-xs text-brand-600">
              {id}: {blank.acceptedAnswers[0]}
            </p>
          ))}
        </div>
      )}
      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── ERROR_FIND — znajdź błąd w rozwiązaniu ─────────────────────────────────

function ErrorFindQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const isAnswered = feedback !== null;

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        {content.question}
      </h3>
      <p className="text-xs text-zinc-500 mb-6">
        Kliknij krok, który zawiera błąd
      </p>
      <div className="space-y-2">
        {content.steps.map(
          (step: { id: number; text: string; isCorrect: boolean }) => {
            const isSelected = response === step.id;
            const isError = step.id === content.correctErrorStep;

            let className =
              "flex items-start gap-3 p-4 rounded-2xl cursor-pointer transition-all border-2 ";
            if (isAnswered && isError) {
              className += "border-red-400 bg-red-50 dark:bg-red-900/10";
            } else if (isAnswered && isSelected && !isError) {
              className += "border-amber-400 bg-amber-50 dark:bg-amber-900/10";
            } else if (isSelected) {
              className += "border-navy-500 bg-navy-50 dark:bg-navy-900/10";
            } else {
              className +=
                "border-transparent bg-zinc-50 dark:bg-surface-800 hover:bg-zinc-100 dark:hover:bg-surface-700";
            }

            return (
              <button
                key={step.id}
                onClick={() => !disabled && onChange(step.id)}
                disabled={disabled}
                className={className + " w-full text-left"}
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold">
                  {step.id}
                </span>
                <span className="text-sm flex-1">{step.text}</span>
                {isAnswered && isError && (
                  <span className="text-red-500 text-lg">✗</span>
                )}
                {isAnswered && !isError && step.isCorrect && (
                  <span className="text-brand-500 text-lg">✓</span>
                )}
              </button>
            );
          },
        )}
      </div>
      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── TABLE_DATA — analiza tabeli ────────────────────────────────────────────

function TableDataQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const answers = (response as Record<string, string>) || {};
  const isAnswered = feedback !== null;

  const setAnswer = (id: string, value: string) => {
    if (disabled) return;
    onChange({ ...answers, [id]: value });
  };

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-4">
        {content.question}
      </h3>

      {/* Table */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {content.table.headers.map((h: string, i: number) => (
                <th
                  key={i}
                  className="px-4 py-2 bg-zinc-100 dark:bg-surface-700 text-left font-semibold border border-zinc-200 dark:border-zinc-700"
                >
                  {h}
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
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sub-questions */}
      <div className="space-y-4">
        {content.subQuestions.map(
          (sq: { id: string; text: string; acceptedAnswers: string[] }) => {
            const isCorrect =
              isAnswered &&
              sq.acceptedAnswers.some(
                (a: string) =>
                  a.toLowerCase().trim() ===
                  (answers[sq.id] || "").toLowerCase().trim(),
              );
            return (
              <div key={sq.id}>
                <label className="block text-sm font-medium mb-1.5">
                  {sq.text}
                </label>
                <input
                  type="text"
                  value={answers[sq.id] || ""}
                  onChange={(e) => setAnswer(sq.id, e.target.value)}
                  disabled={disabled}
                  className={`input ${isAnswered ? (isCorrect ? "!border-brand-500" : "!border-red-500") : ""}`}
                  placeholder="Odpowiedź..."
                />
                {isAnswered && !isCorrect && (
                  <p className="text-xs mt-1 text-brand-600">
                    Poprawna: {sq.acceptedAnswers[0]}
                  </p>
                )}
              </div>
            );
          },
        )}
      </div>
      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── GRAPH_INTERPRET — odczyt z wykresu ─────────────────────────────────────

function GraphInterpretQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const answers = (response as Record<string, string>) || {};
  const isAnswered = feedback !== null;

  const setAnswer = (id: string, value: string) => {
    if (disabled) return;
    onChange({ ...answers, [id]: value });
  };

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-4">
        {content.question}
      </h3>

      {/* Mafs graph */}
      {content.graph && (
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

      {/* Fallback for old graphSvg format */}
      {!content.graph && content.graphSvg && (
        <div
          className="mb-6 p-4 rounded-2xl bg-white dark:bg-surface-800 border border-zinc-200 dark:border-zinc-700"
          dangerouslySetInnerHTML={{ __html: content.graphSvg }}
        />
      )}

      {/* Text description fallback */}
      {!content.graph && !content.graphSvg && content.graphDescription && (
        <p className="text-sm text-zinc-500 italic mb-6 p-4 bg-zinc-50 dark:bg-surface-800 rounded-2xl">
          📊 {content.graphDescription}
        </p>
      )}

      {/* Sub-questions */}
      <div className="space-y-4">
        {content.subQuestions.map(
          (sq: { id: string; text: string; acceptedAnswers: string[] }) => {
            const isCorrect =
              isAnswered &&
              sq.acceptedAnswers.some(
                (a: string) =>
                  a.toLowerCase().trim() ===
                  (answers[sq.id] || "").toLowerCase().trim(),
              );
            return (
              <div key={sq.id}>
                <label className="block text-sm font-medium mb-1.5">
                  {sq.text}
                </label>
                <input
                  type="text"
                  value={answers[sq.id] || ""}
                  onChange={(e) => setAnswer(sq.id, e.target.value)}
                  disabled={disabled}
                  className={`input ${isAnswered ? (isCorrect ? "!border-brand-500" : "!border-red-500") : ""}`}
                  placeholder="Odpowiedź..."
                />
                {isAnswered && !isCorrect && (
                  <p className="text-xs mt-1 text-brand-600">
                    Poprawna: {sq.acceptedAnswers[0]}
                  </p>
                )}
              </div>
            );
          },
        )}
      </div>
      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── PROOF_ORDER — ułóż kroki dowodu ────────────────────────────────────────

function ProofOrderQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const order = (response as string[]) || content.steps.map((s: any) => s.id);
  const isAnswered = feedback !== null;

  const moveUp = (index: number) => {
    if (disabled || index === 0) return;
    const newOrder = [...order];
    [newOrder[index - 1], newOrder[index]] = [
      newOrder[index],
      newOrder[index - 1],
    ];
    onChange(newOrder);
  };

  const moveDown = (index: number) => {
    if (disabled || index === order.length - 1) return;
    const newOrder = [...order];
    [newOrder[index], newOrder[index + 1]] = [
      newOrder[index + 1],
      newOrder[index],
    ];
    onChange(newOrder);
  };

  const stepsMap = Object.fromEntries(content.steps.map((s: any) => [s.id, s]));

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-2">
        {content.question}
      </h3>
      <p className="text-xs text-zinc-500 mb-6">
        Ułóż kroki w poprawnej kolejności
      </p>
      <div className="space-y-2">
        {order.map((stepId: string, i: number) => {
          const step = stepsMap[stepId];
          const isCorrectPosition =
            isAnswered && content.correctOrder[i] === stepId;

          return (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                isAnswered
                  ? isCorrectPosition
                    ? "bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/30"
                    : "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30"
                  : "bg-zinc-50 dark:bg-surface-800"
              }`}
            >
              <span className="text-xs font-bold text-zinc-400 w-6">
                {i + 1}.
              </span>
              <span className="flex-1 text-sm">{step?.text}</span>
              {!disabled && (
                <div className="flex gap-1">
                  <button
                    onClick={() => moveUp(i)}
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
                    onClick={() => moveDown(i)}
                    disabled={i === order.length - 1}
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
      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}

// ── WIAZKA — wiązka podpytań ───────────────────────────────────────────────

function WiazkaQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const answers = (response as Record<string, any>) || {};
  const isAnswered = feedback !== null;

  const setSubAnswer = (subId: string, value: any) => {
    if (disabled) return;
    onChange({ ...answers, [subId]: value });
  };

  return (
    <div>
      {/* Shared context */}
      <div className="p-4 rounded-2xl bg-navy-50 dark:bg-navy-900/10 border border-navy-200 dark:border-navy-800/30 mb-6">
        <p className="text-sm font-medium">{content.context}</p>
      </div>

      {/* Sub-questions */}
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
              <span className="text-sm font-medium">{sq.text}</span>
              <span className="ml-auto text-xs text-zinc-400">
                {sq.points} pkt
              </span>
            </div>

            {/* Sub-question renderers */}
            {sq.type === "FILL_IN" && sq.template && (
              <div className="text-sm leading-8">
                {sq.template
                  .split(/(\{\{[^}]+\}\})/g)
                  .map((part: string, pi: number) => {
                    const match = part.match(/\{\{(\w+)\}\}/);
                    if (!match) return <span key={pi}>{part}</span>;
                    const blankId = match[1];
                    return (
                      <input
                        key={pi}
                        type="text"
                        value={(answers[sq.id] || {})[blankId] || ""}
                        onChange={(e) => {
                          const sub = {
                            ...(answers[sq.id] || {}),
                            [blankId]: e.target.value,
                          };
                          setSubAnswer(sq.id, sub);
                        }}
                        disabled={disabled}
                        className="inline-block w-20 mx-1 px-2 py-1 text-sm text-center border-b-2 border-zinc-300 dark:border-zinc-600 bg-transparent outline-none focus:border-navy-500"
                        placeholder="..."
                      />
                    );
                  })}
              </div>
            )}

            {sq.type === "TRUE_FALSE" && sq.statements && (
              <div className="space-y-2">
                {sq.statements.map((st: any, si: number) => {
                  const subAnswers =
                    (answers[sq.id] as boolean[]) ||
                    sq.statements.map(() => null);
                  return (
                    <div
                      key={si}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-surface-700"
                    >
                      <p className="flex-1 text-xs">{st.text}</p>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            const newA = [...subAnswers];
                            newA[si] = true;
                            setSubAnswer(sq.id, newA);
                          }}
                          disabled={disabled}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold ${subAnswers[si] === true ? "bg-brand-500 text-white" : "bg-zinc-200 dark:bg-zinc-600"}`}
                        >
                          P
                        </button>
                        <button
                          onClick={() => {
                            const newA = [...subAnswers];
                            newA[si] = false;
                            setSubAnswer(sq.id, newA);
                          }}
                          disabled={disabled}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold ${subAnswers[si] === false ? "bg-red-500 text-white" : "bg-zinc-200 dark:bg-zinc-600"}`}
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
              <textarea
                value={answers[sq.id] || ""}
                onChange={(e) => setSubAnswer(sq.id, e.target.value)}
                disabled={disabled}
                rows={3}
                className="input resize-none text-sm"
                placeholder="Odpowiedź..."
              />
            )}

            {sq.type === "CLOSED" && sq.options && (
              <div className="space-y-2">
                {sq.options.map((opt: any) => (
                  <button
                    key={opt.id}
                    onClick={() => !disabled && setSubAnswer(sq.id, opt.id)}
                    disabled={disabled}
                    className={`option-card w-full text-left text-sm ${answers[sq.id] === opt.id ? "selected" : ""}`}
                  >
                    <span className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-surface-600 flex items-center justify-center text-xs font-bold">
                      {opt.id}
                    </span>
                    <span>{opt.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {isAnswered && <FeedbackBlock feedback={feedback} />}
    </div>
  );
}
