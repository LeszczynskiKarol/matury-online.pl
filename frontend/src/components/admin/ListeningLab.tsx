// ============================================================================
// ListeningLab — Admin panel component for testing the full pipeline
// Shows every step: prompt → Claude → parse → segments → DB → TTS → audio
// frontend/src/components/admin/ListeningLab.tsx
// ============================================================================

import { useState, useRef } from "react";

const API = import.meta.env.PUBLIC_API_URL || "/api";

type Pattern =
  | "short_dialogue"
  | "monologue_tf"
  | "interview_mcq"
  | "gap_fill"
  | "extended_mixed";
type Level = "PP" | "PR";

interface Step {
  step: number;
  name: string;
  status: "done" | "error" | "skipped" | "pending";
  data: any;
}

const PATTERNS: { value: Pattern; label: string; desc: string }[] = [
  { value: "short_dialogue", label: "Short Dialogue", desc: "30-60s, 1 MCQ" },
  { value: "monologue_tf", label: "Monologue + T/F", desc: "1-2min, 3-4 T/F" },
  { value: "interview_mcq", label: "Interview + MCQ", desc: "2-3min, 3-4 MCQ" },
  { value: "gap_fill", label: "Gap Fill", desc: "2-3min, 4-5 fill-in" },
  {
    value: "extended_mixed",
    label: "Extended Mixed",
    desc: "3-4min, 5-6 mixed",
  },
];

export function ListeningLab() {
  const [pattern, setPattern] = useState<Pattern>("short_dialogue");
  const [level, setLevel] = useState<Level>("PP");
  const [topic, setTopic] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"preview" | "generate">("preview");
  const [totalTime, setTotalTime] = useState(0);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const run = async (endpoint: "preview" | "generate") => {
    setLoading(true);
    setSteps([
      { step: 1, name: "Prompt", status: "pending", data: null },
      { step: 2, name: "Claude API", status: "pending", data: null },
      { step: 3, name: "Parse JSON", status: "pending", data: null },
      { step: 4, name: "TTS Segments", status: "pending", data: null },
      { step: 5, name: "DB Save", status: "pending", data: null },
      { step: 6, name: "TTS + S3", status: "pending", data: null },
    ]);
    setQuestionId(null);
    setExpandedStep(null);

    try {
      const res = await fetch(`${API}/admin/listening/${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern, level, topic: topic || undefined }),
      });
      const data = await res.json();
      setSteps(data.steps || []);
      setTotalTime(data.totalTimeMs || 0);
      setQuestionId(data.questionId || null);

      // Auto-expand first completed step
      if (data.steps?.length) setExpandedStep(1);
    } catch (e: any) {
      setSteps([
        {
          step: 0,
          name: "Network",
          status: "error",
          data: { error: e.message },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-xl">🎧 Listening Lab</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Generate listening questions step by step — see every prompt,
            response, and API call
          </p>
        </div>
      </div>

      {/* Config */}
      <div className="glass-card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pattern */}
          <div>
            <label className="block text-xs font-semibold mb-2 text-zinc-500 uppercase tracking-wide">
              Pattern
            </label>
            <div className="space-y-1.5">
              {PATTERNS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPattern(p.value)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all ${
                    pattern === p.value
                      ? "bg-blue-500 text-white shadow-md"
                      : "bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-surface-700"
                  }`}
                >
                  <span className="font-semibold">{p.label}</span>
                  <span
                    className={`ml-2 text-xs ${pattern === p.value ? "text-blue-100" : "text-zinc-400"}`}
                  >
                    {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Level + Topic */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-2 text-zinc-500 uppercase tracking-wide">
                Level
              </label>
              <div className="flex gap-2">
                {(["PP", "PR"] as Level[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      level === l
                        ? l === "PP"
                          ? "bg-green-500 text-white shadow-md"
                          : "bg-purple-500 text-white shadow-md"
                        : "bg-zinc-100 dark:bg-surface-800 text-zinc-500"
                    }`}
                  >
                    {l}
                    <span
                      className={`block text-[10px] font-normal ${level === l ? "text-white/70" : "text-zinc-400"}`}
                    >
                      {l === "PP" ? "B1/B1+" : "B2/C1"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2 text-zinc-500 uppercase tracking-wide">
                Topic (optional)
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="input py-2 text-sm"
                placeholder="e.g. booking a hotel, climate change..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 justify-end">
            <button
              onClick={() => {
                setMode("preview");
                run("preview");
              }}
              disabled={loading}
              className="btn-outline text-sm py-3 disabled:opacity-40"
            >
              {loading && mode === "preview" ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                "👁 Preview (no save)"
              )}
            </button>
            <button
              onClick={() => {
                setMode("generate");
                run("generate");
              }}
              disabled={loading}
              className="btn-primary text-sm py-3 disabled:opacity-40"
            >
              {loading && mode === "generate" ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Full pipeline...
                </span>
              ) : (
                "🚀 Generate (save + audio)"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline Steps */}
      {steps.length > 0 && (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <div className="flex gap-1">
              {steps.map((s) => (
                <div
                  key={s.step}
                  className={`w-8 h-1.5 rounded-full transition-all ${
                    s.status === "done"
                      ? "bg-brand-500"
                      : s.status === "error"
                        ? "bg-red-500"
                        : s.status === "skipped"
                          ? "bg-zinc-300 dark:bg-zinc-700"
                          : "bg-zinc-200 dark:bg-zinc-800 animate-pulse"
                  }`}
                />
              ))}
            </div>
            {totalTime > 0 && (
              <span>Total: {(totalTime / 1000).toFixed(1)}s</span>
            )}
            {questionId && (
              <span className="ml-auto font-mono text-brand-600">
                ID: {questionId}
              </span>
            )}
          </div>

          {/* Step cards */}
          {steps.map((s) => (
            <StepCard
              key={s.step}
              step={s}
              expanded={expandedStep === s.step}
              onToggle={() =>
                setExpandedStep(expandedStep === s.step ? null : s.step)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// STEP CARD — collapsible, syntax-highlighted step display
// ══════════════════════════════════════════════════════════════════════════

function StepCard({
  step,
  expanded,
  onToggle,
}: {
  step: Step;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusIcons: Record<string, string> = {
    done: "✅",
    error: "❌",
    skipped: "⏭",
    pending: "⏳",
  };

  const statusColors: Record<string, string> = {
    done: "border-brand-200 dark:border-brand-800/30",
    error: "border-red-200 dark:border-red-800/30",
    skipped: "border-zinc-200 dark:border-zinc-700",
    pending: "border-zinc-200 dark:border-zinc-700 opacity-50",
  };

  return (
    <div
      className={`rounded-2xl border ${statusColors[step.status]} overflow-hidden transition-all`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-50 dark:hover:bg-surface-800/50 transition-colors"
      >
        <span className="text-lg">{statusIcons[step.status]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-sm">
              Step {step.step}: {step.name}
            </span>
            {step.data?.timeMs && (
              <span className="text-[10px] text-zinc-400 font-mono">
                {step.data.timeMs}ms
              </span>
            )}
          </div>
          {/* Mini summary when collapsed */}
          {!expanded && step.data && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">
              {getStepSummary(step)}
            </p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
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

      {/* Body */}
      {expanded && step.data && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
          {step.name === "Prompt" && <PromptView data={step.data} />}
          {step.name === "Claude API" && <ClaudeView data={step.data} />}
          {step.name === "Parse JSON" && <ParsedView data={step.data} />}
          {step.name === "TTS Segments" && <SegmentsView data={step.data} />}
          {step.name === "DB Save" && <DbView data={step.data} />}
          {step.name === "TTS + S3" && <AudioView data={step.data} />}
          {step.status === "error" && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 text-sm text-red-600">
              {step.data.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getStepSummary(step: Step): string {
  switch (step.name) {
    case "Prompt":
      return `${step.data.charCount} chars`;
    case "Claude API":
      return `${step.data.outputTokens} tokens, ${step.data.costEstimate || ""}`;
    case "Parse JSON":
      return `${step.data.subQuestionCount} questions, ~${step.data.estimatedDuration}`;
    case "TTS Segments":
      return `${step.data.segmentCount} segments, ${step.data.voices?.join(", ")}`;
    case "DB Save":
      return step.data.questionId || step.data.message || "";
    case "TTS + S3":
      return step.data.audioUrl || step.data.error || step.data.message || "";
    default:
      return "";
  }
}

// ══════════════════════════════════════════════════════════════════════════
// STEP-SPECIFIC VIEWS
// ══════════════════════════════════════════════════════════════════════════

function PromptView({ data }: { data: any }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-zinc-500">
          SYSTEM PROMPT
        </span>
        <span className="text-[10px] text-zinc-400">
          {data.charCount} chars
        </span>
        <CopyBtn text={data.prompt} />
      </div>
      <pre className="text-xs font-mono bg-zinc-50 dark:bg-surface-900 p-3 rounded-xl overflow-x-auto max-h-64 whitespace-pre-wrap leading-relaxed">
        {data.prompt}
      </pre>
    </div>
  );
}

function ClaudeView({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <Chip label="Model" value={data.model || "claude-haiku-4-5"} />
        <Chip label="Input" value={`${data.inputTokens} tokens`} />
        <Chip label="Output" value={`${data.outputTokens} tokens`} />
        {data.costEstimate && <Chip label="Cost" value={data.costEstimate} />}
        {data.timeMs && <Chip label="Time" value={`${data.timeMs}ms`} />}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-zinc-500">
            RAW RESPONSE
          </span>
          <CopyBtn text={data.rawResponse} />
        </div>
        <pre className="text-xs font-mono bg-zinc-50 dark:bg-surface-900 p-3 rounded-xl overflow-x-auto max-h-80 whitespace-pre-wrap leading-relaxed">
          {data.rawResponse}
        </pre>
      </div>
    </div>
  );
}

function ParsedView({ data }: { data: any }) {
  const p = data.parsed;
  if (!p) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <Chip label="Type" value={p.listeningType} />
        <Chip label="Speakers" value={data.speakerCount} />
        <Chip label="Questions" value={data.subQuestionCount} />
        <Chip label="Duration" value={data.estimatedDuration} />
        <Chip label="Words" value={data.transcriptWordCount} />
        <Chip label="Difficulty" value={p.difficulty} />
      </div>

      {/* Transcript */}
      <div>
        <span className="text-xs font-semibold text-zinc-500 block mb-1">
          TRANSCRIPT
        </span>
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 text-sm leading-relaxed whitespace-pre-line">
          {p.transcript}
        </div>
      </div>

      {/* Context */}
      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10">
        <span className="text-xs font-semibold text-amber-600">
          PL Context:
        </span>
        <span className="text-sm ml-2">{p.contextPL}</span>
      </div>

      {/* Sub-questions */}
      <div>
        <span className="text-xs font-semibold text-zinc-500 block mb-2">
          QUESTIONS
        </span>
        <div className="space-y-2">
          {p.subQuestions?.map((sq: any, i: number) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-zinc-50 dark:bg-surface-800 text-sm"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-full bg-navy-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {String.fromCharCode(97 + i)}
                </span>
                <span className="font-medium text-xs">{sq.type}</span>
                <span className="text-[10px] text-zinc-400 ml-auto">
                  {sq.points} pkt
                </span>
              </div>
              <p className="text-xs mb-1">{sq.text}</p>
              {sq.options && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {sq.options.map((o: any) => (
                    <span
                      key={o.id}
                      className={`px-2 py-0.5 rounded-lg text-[10px] ${
                        o.id === sq.correctAnswer
                          ? "bg-brand-100 dark:bg-brand-900/30 text-brand-700 font-bold"
                          : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500"
                      }`}
                    >
                      {o.id}: {o.text}
                    </span>
                  ))}
                </div>
              )}
              {sq.statements && (
                <div className="space-y-0.5 mt-1">
                  {sq.statements.map((st: any, si: number) => (
                    <span
                      key={si}
                      className={`block text-[10px] ${st.isTrue ? "text-brand-600" : "text-red-500"}`}
                    >
                      {st.isTrue ? "✓ TRUE" : "✗ FALSE"}: {st.text}
                    </span>
                  ))}
                </div>
              )}
              {sq.acceptedAnswers && (
                <span className="text-[10px] text-brand-600 mt-1 block">
                  Accepted: {sq.acceptedAnswers.join(" | ")}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Raw JSON toggle */}
      <details className="text-xs">
        <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600">
          Show raw JSON
        </summary>
        <pre className="mt-2 font-mono bg-zinc-50 dark:bg-surface-900 p-3 rounded-xl overflow-x-auto max-h-60 whitespace-pre-wrap">
          {JSON.stringify(p, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SegmentsView({ data }: { data: any }) {
  const voiceColors: Record<string, string> = {
    "en-GB-Neural2-A": "bg-pink-100 text-pink-700",
    "en-GB-Neural2-B": "bg-blue-100 text-blue-700",
    "en-GB-Neural2-C": "bg-purple-100 text-purple-700",
    "en-GB-Neural2-D": "bg-cyan-100 text-cyan-700",
    "en-US-Neural2-C": "bg-orange-100 text-orange-700",
    "en-US-Neural2-D": "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <Chip label="Segments" value={data.segmentCount} />
        <Chip label="Total chars" value={data.totalChars} />
        <Chip label="TTS cost" value={data.ttsEstimatedCost || "~$0.01"} />
        <Chip label="Voices" value={data.voices?.join(", ")} />
      </div>

      <div className="space-y-1.5">
        {data.segments?.map((seg: any, i: number) => (
          <div
            key={i}
            className="flex items-start gap-2 p-2.5 rounded-xl bg-zinc-50 dark:bg-surface-800"
          >
            <span className="text-[10px] text-zinc-400 w-4 pt-0.5 flex-shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold">{seg.speaker}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${voiceColors[seg.voice] || "bg-zinc-100 text-zinc-600"}`}
                >
                  {seg.voice}
                </span>
                <span className="text-[9px] text-zinc-400">
                  ×{seg.speed} | +{seg.pauseAfterMs}ms
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {seg.text}
              </p>
            </div>
            <span className="text-[10px] text-zinc-400 flex-shrink-0">
              {seg.text.length}ch
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DbView({ data }: { data: any }) {
  return (
    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-surface-800 text-sm">
      {data.questionId ? (
        <div className="flex items-center gap-2">
          <span className="text-brand-600 font-mono font-semibold">
            {data.questionId}
          </span>
          <CopyBtn text={data.questionId} />
          {data.timeMs && (
            <span className="text-xs text-zinc-400">{data.timeMs}ms</span>
          )}
        </div>
      ) : (
        <span className="text-zinc-500">{data.message}</span>
      )}
    </div>
  );
}

function AudioView({ data }: { data: any }) {
  if (data.error) {
    return (
      <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 text-sm text-red-600">
        {data.error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.timeMs && (
        <span className="text-xs text-zinc-400">
          Generated in {(data.timeMs / 1000).toFixed(1)}s
        </span>
      )}
      {data.audioUrl && (
        <div className="p-3 rounded-xl bg-brand-50 dark:bg-brand-900/10">
          <audio controls src={data.audioUrl} className="w-full" />
          <p className="text-xs text-zinc-500 mt-2 font-mono truncate">
            {data.audioUrl}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Shared UI ────────────────────────────────────────────────────────────

function Chip({ label, value }: { label: string; value: any }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-surface-800">
      <span className="text-zinc-400">{label}:</span>
      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
        {String(value)}
      </span>
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500 hover:text-zinc-700 transition-colors"
    >
      {copied ? "✓" : "Copy"}
    </button>
  );
}
