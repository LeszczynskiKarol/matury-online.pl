// ============================================================================
// ExplanationGenerator — Admin panel for filling missing explanations
// frontend/src/components/admin/ExplanationGenerator.tsx
// ============================================================================

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.PUBLIC_API_URL || "/api";

async function apiGet(path: string) {
  const res = await fetch(`${API}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path: string, body?: any) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPut(path: string, body: any) {
  const res = await fetch(`${API}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json();
}

// ── Question type labels ─────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  CLOSED: "Zamknięte",
  MULTI_SELECT: "Wielokrotny",
  OPEN: "Otwarte",
  ESSAY: "Wypracowanie",
  CLOZE: "Luki (cloze)",
  WIAZKA: "Wiązka",
  MATCHING: "Dopasowanie",
  TRUE_FALSE: "P/F",
  FILL_IN: "Wpisywanie",
  ORDERING: "Porządkowanie",
  ERROR_FIND: "Znajdź błąd",
};

const TYPE_COLORS: Record<string, string> = {
  CLOSED: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  MULTI_SELECT:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400",
  OPEN: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  ESSAY:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400",
  CLOZE:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  WIAZKA: "bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400",
};

// ── Main Component ───────────────────────────────────────────────────────

export function ExplanationGenerator() {
  const [stats, setStats] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    subjectId: "",
    topicId: "",
    type: "",
    limit: 20,
    offset: 0,
  });
  const [subjects, setSubjects] = useState<any[]>([]);
  const [model, setModel] = useState("claude-sonnet-4-6");

  // Single question states
  const [selectedQ, setSelectedQ] = useState<any>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [editingExpl, setEditingExpl] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Batch states
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);
  const [batchSize, setBatchSize] = useState(10);

  // ── Load subjects ────────────────────────────────────────────────────
  useEffect(() => {
    apiGet("/admin/subjects").then(setSubjects).catch(console.error);
  }, []);

  // ── Load stats ───────────────────────────────────────────────────────
  const loadStats = useCallback(() => {
    const qs = filters.subjectId ? `?subjectId=${filters.subjectId}` : "";
    apiGet(`/admin/explanations/stats${qs}`)
      .then(setStats)
      .catch(console.error);
  }, [filters.subjectId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── Load questions ───────────────────────────────────────────────────
  const loadQuestions = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.subjectId) params.set("subjectId", filters.subjectId);
    if (filters.topicId) params.set("topicId", filters.topicId);
    if (filters.type) params.set("type", filters.type);
    params.set("limit", String(filters.limit));
    params.set("offset", String(filters.offset));

    apiGet(`/admin/explanations/missing?${params}`)
      .then((d) => {
        setQuestions(d.questions);
        setTotal(d.total);
      })
      .catch(console.error);
  }, [filters]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  // ── Generate single ──────────────────────────────────────────────────
  const handleGenerate = async (qId: string) => {
    setGenerating(qId);
    try {
      const result = await apiPost(`/admin/explanations/generate/${qId}`, {
        model,
      });
      if (result.success) {
        // Update local state
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === qId ? { ...q, explanation: result.explanation } : q,
          ),
        );
        if (selectedQ?.id === qId) {
          setSelectedQ((prev: any) => ({
            ...prev,
            explanation: result.explanation,
            _genResult: result,
          }));
        }
      } else {
        alert(`Błąd: ${result.error}`);
      }
    } catch (e: any) {
      alert(`Błąd: ${e.message}`);
    } finally {
      setGenerating(null);
    }
  };

  // ── Batch generate ───────────────────────────────────────────────────
  const handleBatch = async () => {
    if (
      !confirm(
        `Generuję explanation dla ${batchSize} pytań modelem ${model}. Kontynuować?`,
      )
    )
      return;

    setBatchRunning(true);
    setBatchResult(null);
    try {
      const { jobId, total, status } = await apiPost(
        "/admin/explanations/batch-filter",
        {
          subjectId: filters.subjectId || undefined,
          topicId: filters.topicId || undefined,
          type: filters.type || undefined,
          limit: batchSize,
          model,
        },
      );

      // No questions to process
      if (!jobId) {
        setBatchResult({
          total: 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          totalCostUsd: 0,
          results: [],
        });
        setBatchRunning(false);
        return;
      }

      // Poll for progress every 2s
      const poll = setInterval(async () => {
        try {
          const progress = await apiGet(`/admin/explanations/batch/${jobId}`);
          setBatchResult(progress);

          if (progress.status === "done" || progress.status === "error") {
            clearInterval(poll);
            setBatchRunning(false);
            loadQuestions();
            loadStats();
          }
        } catch {
          clearInterval(poll);
          setBatchRunning(false);
        }
      }, 2000);
    } catch (e: any) {
      alert(`Batch error: ${e.message}`);
      setBatchRunning(false);
    }
  };

  // ── Save manual edit ─────────────────────────────────────────────────
  const handleSaveEdit = async (qId: string) => {
    try {
      await apiPut(`/admin/explanations/${qId}`, { explanation: editText });
      setQuestions((prev) =>
        prev.map((q) => (q.id === qId ? { ...q, explanation: editText } : q)),
      );
      setEditingExpl(null);
      setEditText("");
    } catch (e: any) {
      alert(`Błąd zapisu: ${e.message}`);
    }
  };

  // ── Extract question text from content JSON ──────────────────────────
  const getQuestionPreview = (q: any): string => {
    const c = q.content as any;
    const text =
      c?.question || c?.prompt || c?.text || JSON.stringify(c).slice(0, 120);
    return text.length > 150 ? text.slice(0, 147) + "…" : text;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">
            📝 Explanation Generator
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Uzupełnianie brakujących wyjaśnień przez Claude
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Model:</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-xl bg-zinc-100 dark:bg-surface-800 border-0 font-mono"
          >
            <option value="claude-sonnet-4-6">Sonnet 4.6 ($3/$15)</option>
            <option value="claude-haiku-4-5">Haiku 4.5 ($0.8/$4)</option>
            <option value="claude-opus-4-6">Opus 4.6 ($15/$75)</option>
          </select>
        </div>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card ring-1 ring-amber-200 dark:ring-amber-800/30">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div className="font-display font-bold text-xl text-amber-600">
                {stats.total}
              </div>
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              Brakujących explanations
            </div>
          </div>
          {stats.bySubject.slice(0, 3).map((s: any) => (
            <div key={s.slug} className="stat-card">
              <div className="font-display font-bold text-lg">{s.count}</div>
              <div className="text-xs text-zinc-500 mt-1">{s.name}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Type breakdown pills ────────────────────────────────────── */}
      {stats?.byType?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stats.byType.map((t: any) => (
            <button
              key={t.type}
              onClick={() =>
                setFilters({ ...filters, type: t.type, offset: 0 })
              }
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filters.type === t.type
                  ? "ring-2 ring-brand-500 " +
                    (TYPE_COLORS[t.type] || "bg-zinc-100 text-zinc-700")
                  : TYPE_COLORS[t.type] || "bg-zinc-100 text-zinc-700"
              }`}
            >
              {TYPE_LABELS[t.type] || t.type}: {t.count}
            </button>
          ))}
          {filters.type && (
            <button
              onClick={() => setFilters({ ...filters, type: "", offset: 0 })}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-100 text-red-600 hover:bg-red-200"
            >
              ✕ Reset typu
            </button>
          )}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Przedmiot</label>
          <select
            value={filters.subjectId}
            onChange={(e) =>
              setFilters({
                ...filters,
                subjectId: e.target.value,
                topicId: "",
                offset: 0,
              })
            }
            className="text-sm px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-surface-800 border-0"
          >
            <option value="">Wszystkie</option>
            {subjects.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* ── Batch controls ──────────────────────────────────────── */}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-zinc-500">Batch:</label>
          <select
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className="text-xs px-2 py-1.5 rounded-xl bg-zinc-100 dark:bg-surface-800 border-0 font-mono"
          >
            {[5, 10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} pytań
              </option>
            ))}
          </select>
          <button
            onClick={handleBatch}
            disabled={batchRunning || stats?.total === 0}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-all"
          >
            {batchRunning ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin">⏳</span> Generuję…
              </span>
            ) : (
              `🚀 Generuj batch (${batchSize})`
            )}
          </button>
        </div>
      </div>

      {/* ── Batch result ────────────────────────────────────────────── */}
      {batchResult && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-display font-semibold text-sm">
              {batchResult.status === "running"
                ? "⏳ Batch w toku…"
                : batchResult.status === "error"
                  ? "❌ Batch error"
                  : "✅ Batch zakończony"}
            </h3>
            {batchResult.status === "running" && (
              <span className="text-[10px] text-zinc-400 font-mono">
                {batchResult.processed}/{batchResult.total}
              </span>
            )}
          </div>
          {/* Progress bar */}
          {batchResult.total > 0 && (
            <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${batchResult.status === "error" ? "bg-red-500" : "bg-brand-500"}`}
                style={{
                  width: `${(batchResult.processed / batchResult.total) * 100}%`,
                }}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="font-mono">
              ✅ {batchResult.succeeded}/{batchResult.total}
            </span>
            {batchResult.failed > 0 && (
              <span className="font-mono text-red-500">
                ❌ {batchResult.failed} błędów
              </span>
            )}
            <span className="font-mono text-brand-600">
              💰 ${(batchResult.totalCostUsd || 0).toFixed(4)}
            </span>
            <span className="font-mono text-zinc-500">
              📥 {batchResult.totalInputTokens || 0} → 📤{" "}
              {batchResult.totalOutputTokens || 0} tok
            </span>
          </div>
          {batchResult.results?.some((r: any) => !r.success) && (
            <div className="mt-2 space-y-1">
              {batchResult.results
                .filter((r: any) => !r.success)
                .map((r: any) => (
                  <div
                    key={r.questionId}
                    className="text-xs p-2 rounded-lg bg-red-50 dark:bg-red-900/10 text-red-600"
                  >
                    {r.questionId}: {r.error}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Questions table ─────────────────────────────────────────── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-sm">
            Pytania bez explanation
          </h3>
          <span className="text-xs text-zinc-400">{total} total</span>
        </div>

        <div className="space-y-2">
          {questions.map((q) => (
            <div
              key={q.id}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                selectedQ?.id === q.id
                  ? "border-brand-400 bg-brand-50/50 dark:bg-brand-900/10"
                  : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
              onClick={() => setSelectedQ(selectedQ?.id === q.id ? null : q)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${TYPE_COLORS[q.type] || "bg-zinc-100 text-zinc-600"}`}
                >
                  {TYPE_LABELS[q.type] || q.type}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {q.topic?.name}
                </span>
                {q.topic?.parent?.name && (
                  <span className="text-[10px] text-zinc-300">
                    ({q.topic.parent.name})
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(q.id);
                    setCopiedId(q.id);
                    setTimeout(() => setCopiedId(null), 1500);
                  }}
                  className="text-[10px] text-zinc-300 font-mono ml-auto hover:text-brand-500 transition-colors cursor-copy"
                  title="Kliknij by skopiować pełne ID"
                >
                  {copiedId === q.id ? "✓ skopiowano" : `${q.id.slice(0, 12)}…`}
                </button>
              </div>
              <div className="text-sm mt-1.5 text-zinc-700 dark:text-zinc-300 line-clamp-2">
                {getQuestionPreview(q)}
              </div>

              {/* ── Expanded detail ──────────────────────────────────── */}
              {selectedQ?.id === q.id && (
                <div
                  className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700 space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Full content JSON */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600">
                      Pełna treść (JSON)
                    </summary>
                    <pre className="mt-1 p-2 rounded-lg bg-zinc-50 dark:bg-surface-900 font-mono overflow-auto max-h-48 whitespace-pre-wrap text-[11px]">
                      {JSON.stringify(q.content, null, 2)}
                    </pre>
                  </details>

                  {/* Current explanation (if generated) */}
                  {q.explanation && (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-green-700">
                          ✅ Explanation
                        </span>
                        <button
                          onClick={() => {
                            setEditingExpl(q.id);
                            setEditText(q.explanation);
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500"
                        >
                          Edytuj
                        </button>
                      </div>
                      <p className="text-sm text-green-800 dark:text-green-300">
                        {q.explanation}
                      </p>
                    </div>
                  )}

                  {/* Gen result info */}
                  {selectedQ?._genResult && (
                    <div className="flex flex-wrap gap-2 text-[10px] text-zinc-400 font-mono">
                      <span>💰 ${selectedQ._genResult.costUsd.toFixed(4)}</span>
                      <span>📥 {selectedQ._genResult.inputTokens} tok</span>
                      <span>📤 {selectedQ._genResult.outputTokens} tok</span>
                      <span>⏱ {selectedQ._genResult.durationMs}ms</span>
                      <span>
                        Log: {selectedQ._genResult.logId?.slice(0, 8)}
                      </span>
                    </div>
                  )}

                  {/* Edit mode */}
                  {editingExpl === q.id && (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={4}
                        className="w-full text-sm p-3 rounded-xl bg-zinc-50 dark:bg-surface-900 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-brand-400 outline-none"
                        placeholder="Wpisz explanation…"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(q.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600"
                        >
                          💾 Zapisz
                        </button>
                        <button
                          onClick={() => {
                            setEditingExpl(null);
                            setEditText("");
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs text-zinc-500 hover:text-zinc-700"
                        >
                          Anuluj
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleGenerate(q.id)}
                      disabled={generating === q.id}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-all"
                    >
                      {generating === q.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="animate-spin">⏳</span> Generuję…
                        </span>
                      ) : q.explanation ? (
                        "🔄 Regeneruj"
                      ) : (
                        "🤖 Generuj explanation"
                      )}
                    </button>
                    {!editingExpl && (
                      <button
                        onClick={() => {
                          setEditingExpl(q.id);
                          setEditText(q.explanation || "");
                        }}
                        className="px-3 py-2 rounded-xl text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-surface-800"
                      >
                        ✏️ Ręcznie
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {questions.length === 0 && (
            <div className="text-center py-8 text-zinc-400 text-sm">
              {stats?.total === 0
                ? "🎉 Wszystkie pytania mają explanation!"
                : "Brak wyników dla wybranych filtrów"}
            </div>
          )}
        </div>

        {/* ── Pagination ──────────────────────────────────────────── */}
        {total > filters.limit && (
          <div className="flex items-center justify-between mt-4">
            <button
              disabled={filters.offset === 0}
              onClick={() =>
                setFilters({
                  ...filters,
                  offset: Math.max(0, filters.offset - filters.limit),
                })
              }
              className="btn-ghost text-xs disabled:opacity-30"
            >
              ← Poprzednie
            </button>
            <span className="text-[10px] text-zinc-500">
              {filters.offset + 1}–
              {Math.min(filters.offset + filters.limit, total)} z {total}
            </span>
            <button
              disabled={filters.offset + filters.limit >= total}
              onClick={() =>
                setFilters({
                  ...filters,
                  offset: filters.offset + filters.limit,
                })
              }
              className="btn-ghost text-xs disabled:opacity-30"
            >
              Następne →
            </button>
          </div>
        )}
      </div>

      {/* ── Topic breakdown (collapsible) ───────────────────────────── */}
      {stats?.byTopic?.length > 0 && (
        <details className="glass-card p-5">
          <summary className="cursor-pointer font-display font-semibold text-sm text-zinc-600 hover:text-zinc-800">
            📊 Brakujące per topic ({stats.byTopic.length} tematów)
          </summary>
          <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
            {stats.byTopic.map((t: any) => (
              <div key={t.topicId} className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setFilters({
                      ...filters,
                      topicId: t.topicId,
                      offset: 0,
                    })
                  }
                  className="text-xs font-semibold text-brand-600 hover:underline w-56 text-left truncate"
                >
                  {t.topicName}
                </button>
                <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{
                      width: `${(t.count / Math.max(...stats.byTopic.map((x: any) => x.count))) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-mono w-10 text-right text-zinc-500">
                  {t.count}
                </span>
              </div>
            ))}
          </div>
          {filters.topicId && (
            <button
              onClick={() => setFilters({ ...filters, topicId: "", offset: 0 })}
              className="mt-2 text-xs text-red-500 hover:underline"
            >
              ✕ Reset filtra topicu
            </button>
          )}
        </details>
      )}
    </div>
  );
}
