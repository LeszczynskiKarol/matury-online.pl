// ============================================================================
// frontend/src/components/admin/AdminReports.tsx
// FIXED: fetch-based SSE (works through Vite proxy) + polling fallback
// ============================================================================

import { useState, useEffect, useCallback, useRef } from "react";

const API = import.meta.env.PUBLIC_API_URL || "/api";

const CATEGORY_LABELS: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  WRONG_ANSWER: { icon: "❌", label: "Błędna odpowiedź", color: "red" },
  CONTENT_ERROR: { icon: "📝", label: "Błąd w treści", color: "orange" },
  UNCLEAR: { icon: "❓", label: "Niejasne", color: "amber" },
  MISSING_CONTENT: { icon: "🖼️", label: "Brakujące dane", color: "purple" },
  DISPLAY_BUG: { icon: "🐛", label: "Wyświetlanie", color: "blue" },
  OTHER: { icon: "💬", label: "Inne", color: "zinc" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  NEW: { label: "Nowe", color: "bg-red-500 text-white" },
  IN_PROGRESS: { label: "W toku", color: "bg-amber-500 text-white" },
  RESOLVED: { label: "Rozwiązane", color: "bg-brand-500 text-white" },
  DISMISSED: { label: "Odrzucone", color: "bg-zinc-400 text-white" },
};

const TYPE_LABELS: Record<string, string> = {
  CLOSED: "Zamknięte",
  MULTI_SELECT: "Wielokrotne",
  TRUE_FALSE: "P/F",
  OPEN: "Otwarte",
  FILL_IN: "Uzupełnij",
  MATCHING: "Dopasuj",
  ORDERING: "Kolejność",
  WIAZKA: "Wiązka",
  LISTENING: "Słuchanie",
  TABLE_DATA: "Tabela",
  GRAPH_INTERPRET: "Wykres",
  ERROR_FIND: "Błąd",
  CLOZE: "Luki",
  PROOF_ORDER: "Dowód",
  ESSAY: "Esej",
  DIAGRAM_LABEL: "Schemat",
  EXPERIMENT_DESIGN: "Doświadczenie",
  CROSS_PUNNETT: "Krzyżówka",
  CALCULATION: "Obliczenia",
};

interface Report {
  id: string;
  category: string;
  description: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  user: { id: string; name: string | null; email: string } | null;
  question: {
    id: string;
    type: string;
    difficulty: number;
    content: any;
    isActive: boolean;
    topic: { id: string; name: string };
    subject: { id: string; name: string; icon: string };
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Robust SSE hook — fetch-based streaming + polling fallback
// ══════════════════════════════════════════════════════════════════════════

function useReportStream(onEvent: (data: any) => void) {
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef = useRef<number>(0);

  useEffect(() => {
    let alive = true;

    const connectSSE = async () => {
      // Spróbuj fetch-based SSE (działa przez Vite proxy)
      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch(`${API}/admin/reports/stream`, {
          credentials: "include",
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE failed: ${res.status}`);
        }

        setConnected(true);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (alive) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parsuj SSE events z bufora
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Ostatnia linia może być niepełna

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                onEvent(data);
              } catch {}
            }
            // Ignoruj komentarze (heartbeat) i puste linie
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") return; // Intentional disconnect
        console.warn(
          "[SSE] Stream failed, falling back to polling:",
          err.message,
        );
      }

      if (!alive) return;
      setConnected(false);

      // ── Fallback: polling co 8s ──
      console.log("[SSE] Starting polling fallback");
      pollingRef.current = setInterval(async () => {
        if (!alive) return;
        try {
          const res = await fetch(`${API}/admin/reports?status=NEW&limit=5`, {
            credentials: "include",
          });
          const data = await res.json();
          const newCount = data.newCount || 0;

          // Jeśli count się zmienił → wyślij event
          if (newCount > lastCountRef.current && lastCountRef.current > 0) {
            // Nowe zgłoszenia pojawiły się od ostatniego sprawdzenia
            for (const report of data.reports.slice(
              0,
              newCount - lastCountRef.current,
            )) {
              onEvent({
                type: "new_report",
                report: {
                  id: report.id,
                  category: report.category,
                  categoryLabel:
                    CATEGORY_LABELS[report.category]?.label || report.category,
                  description: report.description,
                  status: report.status,
                  createdAt: report.createdAt,
                  user: report.user,
                  question: report.question,
                },
              });
            }
          }
          lastCountRef.current = newCount;

          // init event on first poll
          if (lastCountRef.current === 0) {
            onEvent({ type: "init", newCount });
            lastCountRef.current = newCount;
          }
        } catch {}
      }, 8_000);

      // Immediate first poll
      try {
        const res = await fetch(`${API}/admin/reports?status=NEW&limit=1`, {
          credentials: "include",
        });
        const data = await res.json();
        lastCountRef.current = data.newCount || 0;
        onEvent({ type: "init", newCount: data.newCount || 0 });
      } catch {}
    };

    connectSSE();

    return () => {
      alive = false;
      abortRef.current?.abort();
      if (pollingRef.current) clearInterval(pollingRef.current);
      setConnected(false);
    };
  }, []); // Intentionally no deps — onEvent is stable via ref below

  return connected;
}

// ══════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════

export function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "",
    category: "",
    offset: 0,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [liveReports, setLiveReports] = useState<any[]>([]);

  // Stable ref for SSE callback
  const handleSSEEvent = useCallback((data: any) => {
    if (data.type === "init") {
      setNewCount(data.newCount);
    }

    if (data.type === "new_report") {
      setLiveReports((prev) => [data.report, ...prev].slice(0, 20));
      setNewCount((c) => c + 1);

      // Notification sound
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.15;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      } catch {}
    }

    if (data.type === "report_updated") {
      setReports((prev) =>
        prev.map((r) =>
          r.id === data.report.id
            ? {
                ...r,
                status: data.report.status,
                adminNote: data.report.adminNote,
              }
            : r,
        ),
      );
    }
  }, []);

  const sseConnected = useReportStream(handleSSEEvent);

  // ── Load reports from DB ───────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filters.status) qs.set("status", filters.status);
      if (filters.category) qs.set("category", filters.category);
      qs.set("limit", "50");
      qs.set("offset", String(filters.offset));

      const res = await fetch(`${API}/admin/reports?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();
      setReports(data.reports);
      setTotal(data.total);
      setNewCount(data.newCount);
    } catch (e) {
      console.error("Failed to load reports:", e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Actions ────────────────────────────────────────────────────────────
  const updateStatus = async (
    id: string,
    status: string,
    adminNote?: string,
  ) => {
    try {
      await fetch(`${API}/admin/reports/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(adminNote ? { adminNote } : {}) }),
      });
      load();
    } catch (e) {
      console.error("Failed to update report:", e);
    }
  };

  const preview = (content: any) => {
    if (!content) return "—";
    const text = content.question || content.context || content.prompt || "";
    return text.length > 80 ? text.slice(0, 80) + "…" : text;
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString("pl", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Live feed bar ─────────────────────────────────────────────── */}
      {liveReports.length > 0 && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">
              Live — nowe zgłoszenia
            </span>
            <button
              onClick={() => {
                setLiveReports([]);
                load();
              }}
              className="ml-auto text-[10px] text-red-500 hover:text-red-700 transition-colors"
            >
              Wyczyść i odśwież ↻
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {liveReports.map((r, i) => (
              <div
                key={r.id || i}
                className="flex items-center gap-3 p-2 rounded-xl bg-white/80 dark:bg-surface-800/80 text-xs animate-scale-in"
              >
                <span className="text-base">
                  {CATEGORY_LABELS[r.category]?.icon || "📌"}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {r.user?.name || r.user?.email || "Anonim"}
                  </span>
                  <span className="text-zinc-400 mx-1">→</span>
                  <span className="text-zinc-500 truncate">
                    {r.description?.slice(0, 60)}
                    {r.description?.length > 60 ? "…" : ""}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                  {r.question?.subject?.icon}{" "}
                  {r.question?.topic?.name
                    ?.replace(/^[IVXLCDM]+\.\s*/, "")
                    .slice(0, 15)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Header + filters ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-lg">Zgłoszenia</h3>
          {newCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
              {newCount} nowe
            </span>
          )}
        </div>

        {/* Connection indicator */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium ${
            sseConnected
              ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              sseConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            }`}
          />
          {sseConnected ? "Live" : "Polling"}
        </div>

        <div className="flex gap-2 ml-auto">
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters({ ...filters, status: e.target.value, offset: 0 })
            }
            className="input py-1.5 text-xs min-w-[120px]"
          >
            <option value="">Wszystkie statusy</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value, offset: 0 })
            }
            className="input py-1.5 text-xs min-w-[120px]"
          >
            <option value="">Wszystkie kategorie</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[10px] text-zinc-400">Łącznie: {total} zgłoszeń</p>

      {/* ── Reports list ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">
          Brak zgłoszeń
          {filters.status || filters.category ? " dla wybranych filtrów" : ""}.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const cat = CATEGORY_LABELS[r.category] || CATEGORY_LABELS.OTHER;
            const st = STATUS_LABELS[r.status] || STATUS_LABELS.NEW;
            const isExpanded = expanded === r.id;

            return (
              <div
                key={r.id}
                className={`rounded-2xl border transition-all duration-200 ${
                  r.status === "NEW"
                    ? "border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-900/5"
                    : r.status === "IN_PROGRESS"
                      ? "border-amber-200 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-900/5"
                      : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-surface-900"
                }`}
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                >
                  <span className="text-xl flex-shrink-0">{cat.icon}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${st.color}`}
                      >
                        {st.label}
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-500">
                        {cat.label}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-600">
                        ·
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {r.question.subject.icon}{" "}
                        {r.question.topic.name
                          .replace(/^[IVXLCDM]+\.\s*/, "")
                          .slice(0, 25)}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-600">
                        ·
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {TYPE_LABELS[r.question.type] || r.question.type}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-1">
                      {r.description}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                      {fmtDate(r.createdAt)}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {r.user?.name || r.user?.email?.split("@")[0] || "—"}
                    </span>
                  </div>

                  <svg
                    className={`w-4 h-4 text-zinc-400 transition-transform flex-shrink-0 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
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
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-zinc-200 dark:border-zinc-700 pt-4 animate-slide-up">
                    {/* Pełny opis */}
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-surface-800">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Opis problemu
                      </p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                        {r.description}
                      </p>
                    </div>

                    {/* Pytanie preview */}
                    <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800/30">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                          Pytanie
                        </p>
                        <code className="text-[9px] font-mono text-zinc-400 select-all">
                          {r.question.id}
                        </code>
                        {!r.question.isActive && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-bold">
                            NIEAKTYWNE
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        {preview(r.question.content)}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(
                              JSON.stringify(r.question.content, null, 2),
                            );
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-sky-100 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 hover:bg-sky-200 transition-all"
                        >
                          📋 Kopiuj content JSON
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(r.question.id);
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 transition-all"
                        >
                          Kopiuj ID
                        </button>
                      </div>
                    </div>

                    {/* Admin note */}
                    {r.adminNote && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">
                          Notatka admina
                        </p>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          {r.adminNote}
                        </p>
                      </div>
                    )}

                    {/* Akcje */}
                    <div className="flex flex-wrap gap-2">
                      {r.status !== "RESOLVED" && (
                        <button
                          onClick={() => updateStatus(r.id, "RESOLVED")}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-sm transition-all"
                        >
                          ✓ Rozwiązane
                        </button>
                      )}
                      {r.status === "NEW" && (
                        <button
                          onClick={() => updateStatus(r.id, "IN_PROGRESS")}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 shadow-sm transition-all"
                        >
                          🔧 W toku
                        </button>
                      )}
                      {r.status !== "DISMISSED" && (
                        <button
                          onClick={() => updateStatus(r.id, "DISMISSED")}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 transition-all"
                        >
                          ✕ Odrzuć
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const note = prompt("Notatka admina (opcjonalnie):");
                          if (note !== null) {
                            updateStatus(r.id, "RESOLVED", note || undefined);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand-100 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 hover:bg-brand-200 transition-all"
                      >
                        ✓ Rozwiąż z notatką
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={filters.offset === 0}
            onClick={() =>
              setFilters({
                ...filters,
                offset: Math.max(0, filters.offset - 50),
              })
            }
            className="btn-ghost text-xs disabled:opacity-30"
          >
            ← Poprzednie
          </button>
          <span className="text-xs text-zinc-500">
            {filters.offset + 1}–{Math.min(filters.offset + 50, total)} z{" "}
            {total}
          </span>
          <button
            disabled={filters.offset + 50 >= total}
            onClick={() =>
              setFilters({ ...filters, offset: filters.offset + 50 })
            }
            className="btn-ghost text-xs disabled:opacity-30"
          >
            Następne →
          </button>
        </div>
      )}
    </div>
  );
}
