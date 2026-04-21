// ============================================================================
// ListeningQuestion — React component for audio-based questions
// frontend/src/components/quiz/ListeningQuestion.tsx
// ============================================================================
//
// Features:
// - Audio player with play count limit (matura: max 2 plays)
// - Visual play counter
// - Sub-questions: CLOSED, TRUE_FALSE, OPEN, FILL_IN
// - Responsive, matches existing quiz design system
// ============================================================================

import { useState, useRef, useEffect, useCallback } from "react";

interface SubQuestion {
  id: string;
  text: string;
  type: "CLOSED" | "TRUE_FALSE" | "OPEN" | "FILL_IN";
  points: number;
  options?: { id: string; text: string }[];
  statements?: { text: string; isTrue: boolean }[];
  acceptedAnswers?: string[];
  correctAnswer?: string;
}

interface ListeningContent {
  listeningType: string;
  audioUrl: string | null;
  audioDurationMs: number | null;
  maxPlays: number;
  contextPL: string;
  question: string;
  subQuestions: SubQuestion[];
}

interface Props {
  content: ListeningContent;
  response: Record<string, any> | null;
  onChange: (v: Record<string, any>) => void;
  disabled: boolean;
  feedback: any;
}

export function ListeningQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: Props) {
  // Normalize Claude's inconsistent output format
  const normalizedSubs = (content.subQuestions || []).map(
    (sq: any, i: number) => ({
      id: String(sq.id || String.fromCharCode(97 + i)),
      text: sq.text || sq.question || "",
      type:
        sq.type ||
        (sq.options
          ? "CLOSED"
          : sq.statements
            ? "TRUE_FALSE"
            : sq.acceptedAnswers
              ? "FILL_IN"
              : "OPEN"),
      points: sq.points || 1,
      options: Array.isArray(sq.options)
        ? sq.options.map((o: any) => ({ id: o.id || o.letter, text: o.text }))
        : undefined,
      correctAnswer: sq.correctAnswer,
      statements: sq.statements,
      acceptedAnswers: sq.acceptedAnswers,
    }),
  );
  const normalizedContent = { ...content, subQuestions: normalizedSubs };
  const ans = (response as Record<string, any>) || {};
  const isA = feedback !== null;

  const set = (id: string, v: any) => {
    if (disabled) return;
    onChange({ ...ans, [id]: v });
  };

  return (
    <div>
      {/* Context / instruction */}
      <p className="text-sm text-zinc-500 mb-3">{content.contextPL}</p>
      <h3 className="font-display font-semibold text-lg mb-5">
        {content.question}
      </h3>

      {/* Audio Player */}
      <AudioPlayer
        src={content.audioUrl}
        maxPlays={content.maxPlays}
        durationMs={content.audioDurationMs}
        disabled={disabled}
      />

      {/* Sub-questions */}
      <div className="space-y-5 mt-6">
        {normalizedContent.subQuestions.map((sq: any, i: number) => (
          <div
            key={sq.id}
            className="p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">
                {i + 1}
              </span>
              <span className="text-sm font-medium flex-1">{sq.text}</span>
              <span className="text-xs text-zinc-400">{sq.points} pkt</span>
            </div>

            {sq.type === "CLOSED" && sq.options && (
              <div className="space-y-2">
                {sq.options.map((o) => {
                  let c = "option-card w-full text-left text-sm";
                  if (ans[sq.id] === o.id) c += " selected";
                  if (isA && o.id === sq.correctAnswer) c += " correct";
                  if (
                    isA &&
                    ans[sq.id] === o.id &&
                    ans[sq.id] !== sq.correctAnswer
                  )
                    c += " wrong";
                  return (
                    <button
                      key={o.id}
                      onClick={() => !disabled && set(sq.id, o.id)}
                      disabled={disabled}
                      className={c}
                    >
                      <span className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-surface-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {o.id}
                      </span>
                      <span>{o.text}</span>
                      {isA && o.id === sq.correctAnswer && (
                        <span className="ml-auto text-brand-500">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {sq.type === "TRUE_FALSE" && sq.statements && (
              <div className="space-y-2">
                {sq.statements.map((st: any, si: number) => {
                  const sa =
                    (ans[sq.id] as boolean[]) || sq.statements!.map(() => null);
                  return (
                    <div
                      key={si}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-surface-700"
                    >
                      <p className="flex-1 text-xs">{st.text}</p>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            const n = [...sa];
                            n[si] = true;
                            set(sq.id, n);
                          }}
                          disabled={disabled}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold ${sa[si] === true ? "bg-brand-500 text-white" : "bg-zinc-200 dark:bg-zinc-600"}`}
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
                          className={`px-2 py-1 rounded-lg text-xs font-semibold ${sa[si] === false ? "bg-red-500 text-white" : "bg-zinc-200 dark:bg-zinc-600"}`}
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
                value={ans[sq.id] || ""}
                onChange={(e) => set(sq.id, e.target.value)}
                disabled={disabled}
                rows={2}
                className="input resize-none text-sm"
                placeholder="Your answer..."
              />
            )}

            {sq.type === "FILL_IN" && (
              <input
                type="text"
                value={ans[sq.id] || ""}
                onChange={(e) => set(sq.id, e.target.value)}
                disabled={disabled}
                className={`input text-sm ${isA ? (sq.acceptedAnswers?.some((a) => a.toLowerCase().trim() === (ans[sq.id] || "").toLowerCase().trim()) ? "!border-brand-500" : "!border-red-500") : ""}`}
                placeholder="Type your answer..."
              />
            )}

            {/* Show correct answer after feedback */}
            {isA &&
              sq.type === "FILL_IN" &&
              sq.acceptedAnswers &&
              !sq.acceptedAnswers.some(
                (a) =>
                  a.toLowerCase().trim() ===
                  (ans[sq.id] || "").toLowerCase().trim(),
              ) && (
                <p className="text-xs mt-1 text-brand-600">
                  Correct: {sq.acceptedAnswers[0]}
                </p>
              )}
          </div>
        ))}
      </div>

      {/* Feedback block (reuse from parent or inline) */}
      {isA && feedback?.explanation && (
        <div
          className={`mt-6 p-4 rounded-2xl animate-slide-up ${feedback.isCorrect ? "bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/30" : "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30"}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {feedback.isCorrect ? "✅" : "❌"}
              </span>
              <span className="font-display font-semibold text-sm">
                {feedback.isCorrect ? "Correct!" : "Incorrect"}
              </span>
            </div>
            <span className="xp-badge animate-xp-pop">
              +{feedback.xpEarned} XP
            </span>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {feedback.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// AUDIO PLAYER — with play count limit, progress bar, waveform-style UI
// ══════════════════════════════════════════════════════════════════════════

function AudioPlayer({
  src,
  maxPlays,
  durationMs,
  disabled,
}: {
  src: string | null;
  maxPlays: number;
  durationMs: number | null;
  disabled: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playCount, setPlayCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);

  const canPlay = playCount < maxPlays && !disabled;
  const playsLeft = maxPlays - playCount;

  const handlePlay = useCallback(() => {
    if (!canPlay || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play();
    setIsPlaying(true);
    setPlayCount((c) => c + 1);
  }, [canPlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(
        audio.duration ? (audio.currentTime / audio.duration) * 100 : 0,
      );
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(100);
    };
    const onLoaded = () => {
      setDuration(audio.duration);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoaded);
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!src) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
        <svg
          className="w-5 h-5 text-amber-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <span className="text-sm text-amber-700 dark:text-amber-400">
          Audio is being generated. Try again in a moment.
        </span>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 mb-2">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-4">
        {/* Play button */}
        <button
          onClick={handlePlay}
          disabled={!canPlay || isPlaying}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
            canPlay && !isPlaying
              ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 cursor-pointer"
              : isPlaying
                ? "bg-blue-500/20 text-blue-500 animate-pulse"
                : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
          }`}
        >
          {isPlaying ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg
              className="w-6 h-6 ml-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Progress + info */}
        <div className="flex-1 min-w-0">
          {/* Waveform-style progress bar */}
          <div className="relative h-10 flex items-center gap-[2px] mb-1.5">
            {Array.from({ length: 50 }).map((_, i) => {
              const height =
                20 + Math.sin(i * 0.7) * 15 + Math.cos(i * 1.3) * 10;
              const filled = (i / 50) * 100 <= progress;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-all duration-75 ${
                    filled
                      ? "bg-blue-500 dark:bg-blue-400"
                      : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                  style={{ height: `${Math.max(4, height)}%` }}
                />
              );
            })}
          </div>

          {/* Time + plays */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-mono tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: maxPlays }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i < playCount
                      ? "bg-blue-500"
                      : "bg-zinc-300 dark:bg-zinc-600"
                  }`}
                />
              ))}
              <span className="text-[10px] text-zinc-400 ml-1">
                {playsLeft > 0
                  ? `${playsLeft} play${playsLeft > 1 ? "s" : ""} left`
                  : "No plays left"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Warning when last play */}
      {playCount === maxPlays - 1 && !isPlaying && playCount > 0 && (
        <div className="mt-3 p-2 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-center">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            ⚠ Last play remaining. Listen carefully!
          </span>
        </div>
      )}

      {/* Exhausted */}
      {playCount >= maxPlays && !isPlaying && (
        <div className="mt-3 p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
          <span className="text-xs text-zinc-500">
            Recording finished. Answer the questions below.
          </span>
        </div>
      )}
    </div>
  );
}
