// ══════════════════════════════════════════════════════════════════════════
// AdminQuestionLog — ścisła lista pytań, powtórki podświetlone
// Plik: src/components/admin/AdminQuestionLog.tsx
// ══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";

const API = import.meta.env.PUBLIC_API_URL || "/api";

const T: Record<string, string> = {
  CLOSED: "ZAM",
  MULTI_SELECT: "WIE",
  TRUE_FALSE: "P/F",
  OPEN: "OTW",
  FILL_IN: "UZU",
  MATCHING: "DOP",
  ORDERING: "KOL",
  WIAZKA: "WIĄ",
  LISTENING: "SŁU",
  TABLE_DATA: "TAB",
  GRAPH_INTERPRET: "WYK",
  ERROR_FIND: "BŁĘ",
  CLOZE: "LUK",
  PROOF_ORDER: "DOW",
  ESSAY: "ESE",
  DIAGRAM_LABEL: "SCH",
  EXPERIMENT_DESIGN: "DOŚ",
  CROSS_PUNNETT: "GEN",
  CALCULATION: "OBL",
};

const ST: Record<string, string> = {
  PRACTICE: "ĆWI",
  TOPIC_DRILL: "DRY",
  REVIEW: "POW",
  MOCK_EXAM: "MAT",
  ADAPTIVE: "ADA",
};

const REPEAT_COLORS = [
  "", // 1st occurrence — no highlight
  "bg-amber-50 dark:bg-amber-900/10", // 2nd
  "bg-orange-50 dark:bg-orange-900/10", // 3rd
  "bg-red-50 dark:bg-red-900/15", // 4th+
];

function rc(n: number) {
  if (n <= 1) return "";
  if (n === 2) return REPEAT_COLORS[1];
  if (n === 3) return REPEAT_COLORS[2];
  return REPEAT_COLORS[3];
}

// ── Algorithm milestones — dodawaj tutaj przy każdym deployu zmian ──────
const ALGO_MILESTONES = [
  {
    date: new Date("2026-04-23T21:50:00+02:00"),
    label: "Algorytm v2",
    details:
      "1h hard-exclude, skip-rate per typ, quadratic topic penalty, OPEN cap=2",
    color: "emerald",
  },
  {
    date: new Date("2026-04-23T22:15:00+02:00"),
    label: "Algorytm v2.1",
    details:
      "Adaptive topic cap (proporcjonalny do liczby tematów w puli — polski 2/10, biologia 4/10)",
    color: "emerald",
  },
  // Kolejne milestone'y dodawaj tutaj:
] as const;

export function AdminQuestionLog() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState({ userId: "", subjectId: "" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [onlyRepeats, setOnlyRepeats] = useState(false);

  useEffect(() => {
    fetch(`${API}/admin/subjects`, { credentials: "include" })
      .then((r) => r.json())
      .then(setSubjects)
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (append = false, before?: string) => {
      append ? setLoadingMore(true) : setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("limit", "150");
        if (filters.userId) qs.set("userId", filters.userId);
        if (filters.subjectId) qs.set("subjectId", filters.subjectId);
        if (before) qs.set("before", before);
        const res = await fetch(`${API}/admin/question-view-log?${qs}`, {
          credentials: "include",
        });
        const data = await res.json();
        setRows((prev) => (append ? [...prev, ...data.events] : data.events));
        setHasMore(data.hasMore);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (data: any, key: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(key);
    } catch {}
  };

  // ── Repeat detection ────────────────────────────────────────────────
  const { countMap, repeatSet } = useMemo(() => {
    const cm = new Map<string, number>();
    for (const r of rows) {
      cm.set(r.questionId, (cm.get(r.questionId) || 0) + 1);
    }
    const rs = new Set<string>();
    cm.forEach((count, qid) => {
      if (count > 1) rs.add(qid);
    });
    return { countMap: cm, repeatSet: rs };
  }, [rows]);

  // Occurrence index per questionId (how many times seen so far)
  const occurrenceMap = useMemo(() => {
    const om = new Map<string, number>();
    const result = new Map<string, number>(); // answer.id → occurrence#
    for (const r of rows) {
      const n = (om.get(r.questionId) || 0) + 1;
      om.set(r.questionId, n);
      result.set(r.id, n);
    }
    return result;
  }, [rows]);

  const displayRows = onlyRepeats
    ? rows.filter((r) => repeatSet.has(r.questionId))
    : rows;

  const loadMore = () => {
    if (!hasMore || loadingMore || rows.length === 0) return;
    const last = rows[rows.length - 1];
    load(true, last.createdAt);
  };

  const trunc = (s: string, n = 60) => {
    if (!s) return "—";
    const c = s.replace(/\n/g, " ").trim();
    return c.length > n ? c.slice(0, n) + "…" : c;
  };

  const preview = (c: any) => {
    if (!c) return "—";
    if (typeof c === "string") return trunc(c);
    return trunc(
      c.question || c.context || c.instruction || c.prompt || JSON.stringify(c),
    );
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString("pl", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const fmtMs = (ms: number | null) => {
    if (!ms) return "";
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
  };

  // ── Track session boundaries + algo milestones ──────────────────────
  let prevSessionId = "";
  const shownMilestones = new Set<number>();

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">
            User ID
          </label>
          <input
            value={filters.userId}
            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
            className="input py-1.5 text-xs font-mono"
            placeholder="opcjonalnie…"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">
            Przedmiot
          </label>
          <select
            value={filters.subjectId}
            onChange={(e) =>
              setFilters({ ...filters, subjectId: e.target.value })
            }
            className="input py-1.5 text-xs min-w-[120px]"
          >
            <option value="">Wszystkie</option>
            {subjects.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setOnlyRepeats(!onlyRepeats)}
          className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
            onlyRepeats
              ? "bg-red-500 text-white shadow-md"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          🔁 Powtórki ({repeatSet.size})
        </button>
        <span className="text-[10px] text-zinc-400 ml-auto">
          {rows.length} załadowanych · {repeatSet.size} powtórzonych ID
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-zinc-100 dark:bg-surface-800 text-zinc-500 text-left">
              <th className="py-1.5 px-2 font-semibold w-8">#</th>
              <th className="py-1.5 px-2 font-semibold">Question ID</th>
              <th className="py-1.5 px-2 font-semibold w-10">Typ</th>
              <th className="py-1.5 px-2 font-semibold w-8">Tr.</th>
              <th className="py-1.5 px-2 font-semibold">Temat</th>
              <th className="py-1.5 px-2 font-semibold">Treść</th>
              <th className="py-1.5 px-2 font-semibold w-6 text-center">?</th>
              <th
                className="py-1.5 px-2 font-semibold w-8 text-center"
                title="Ile razy wyświetlone"
              >
                👁
              </th>
              <th className="py-1.5 px-2 font-semibold w-10">Czas</th>
              <th className="py-1.5 px-2 font-semibold">Sesja</th>
              <th className="py-1.5 px-2 font-semibold w-14">Data</th>
              <th className="py-1.5 px-2 font-semibold w-16"></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => {
              const q = row.question;
              const isSkip = row.answer?.response === "__SKIPPED__";
              const occ = occurrenceMap.get(row.id) || 1;
              const totalOcc = countMap.get(row.questionId) || 1;
              const isRepeat = totalOcc > 1;
              const isExp = expanded === row.id;

              // Session boundary separator
              const isNewSession = row.sessionId !== prevSessionId;
              prevSessionId = row.sessionId;

              // Algo milestone detection (rows are DESC — newest first)
              // Show milestone when we cross its timestamp going backward
              const rowTime = new Date(row.createdAt).getTime();
              const milestoneRows: (typeof ALGO_MILESTONES)[number][] = [];
              for (let mi = 0; mi < ALGO_MILESTONES.length; mi++) {
                if (shownMilestones.has(mi)) continue;
                const msTime = ALGO_MILESTONES[mi].date.getTime();
                if (rowTime < msTime) {
                  // This row is before the milestone — show it above this row
                  milestoneRows.push(ALGO_MILESTONES[mi]);
                  shownMilestones.add(mi);
                }
              }

              return (
                <>
                  {/* Algo milestone separator(s) */}
                  {milestoneRows.map((ms, mi) => (
                    <tr key={`ms-${ms.date.getTime()}-${mi}`}>
                      <td colSpan={12} className="py-0">
                        <div className="flex items-center gap-3 py-2 px-3 bg-emerald-100 dark:bg-emerald-900/20 border-y-2 border-emerald-400 dark:border-emerald-600">
                          <span className="text-sm">🚀</span>
                          <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest">
                            {ms.label}
                          </span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            {ms.details}
                          </span>
                          <span className="text-[9px] text-emerald-500 dark:text-emerald-500 font-mono ml-auto">
                            {ms.date.toLocaleString("pl", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Session separator */}
                  {isNewSession && idx > 0 && (
                    <tr key={`sep-${row.id}`}>
                      <td colSpan={12} className="py-0">
                        <div className="flex items-center gap-2 py-1 px-2 bg-indigo-50 dark:bg-indigo-900/10 border-y border-indigo-200 dark:border-indigo-800/30">
                          <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">
                            {row.session?.subject?.icon || "📝"} Sesja{" "}
                            {ST[row.session?.type] || row.session?.type}
                          </span>
                          <span className="text-[9px] text-indigo-400 font-mono">
                            {row.sessionId?.slice(0, 12)}…
                          </span>
                          {row.user && (
                            <span className="text-[9px] text-indigo-400">
                              {row.user.name || row.user.email}
                              {row.user.role === "ADMIN" && (
                                <span className="text-amber-500 font-bold ml-0.5">
                                  A
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Question row */}
                  <tr
                    key={row.id}
                    className={`border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-surface-800 transition-colors ${
                      isRepeat ? rc(occ) : ""
                    } ${isSkip ? "opacity-40" : ""}`}
                  >
                    {/* Index */}
                    <td className="py-1 px-2 text-zinc-400 text-right tabular-nums">
                      {idx + 1}
                    </td>

                    {/* Question ID — prominent, selectable */}
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-1">
                        <code className="font-mono text-[10px] select-all text-zinc-700 dark:text-zinc-300">
                          {row.questionId.slice(0, 8)}
                          <span className="text-zinc-300 dark:text-zinc-600">
                            {row.questionId.slice(8, 20)}…
                          </span>
                        </code>
                        {isRepeat && (
                          <span
                            className={`px-1 py-0 rounded text-[8px] font-black ${
                              totalOcc >= 4
                                ? "bg-red-500 text-white"
                                : totalOcc === 3
                                  ? "bg-orange-500 text-white"
                                  : "bg-amber-400 text-white"
                            }`}
                          >
                            ×{totalOcc}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Type */}
                    <td className="py-1 px-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                        {T[q?.type] || q?.type?.slice(0, 3) || "?"}
                      </span>
                    </td>

                    {/* Difficulty */}
                    <td className="py-1 px-2 text-center">
                      <div className="flex gap-px justify-center">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={`w-1 h-1 rounded-full ${
                              i <= (q?.difficulty || 0)
                                ? "bg-amber-500"
                                : "bg-zinc-200 dark:bg-zinc-700"
                            }`}
                          />
                        ))}
                      </div>
                    </td>

                    {/* Topic */}
                    <td
                      className="py-1 px-2 text-zinc-500 truncate max-w-[120px]"
                      title={q?.topic?.name}
                    >
                      {q?.topic?.name
                        ?.replace(/^[IVXLCDM]+\.\s*/, "")
                        .slice(0, 20) || "—"}
                    </td>

                    {/* Preview */}
                    <td
                      className="py-1 px-2 text-zinc-500 truncate max-w-[200px]"
                      title={preview(q?.content)}
                    >
                      {preview(q?.content)}
                    </td>

                    {/* Result */}
                    <td className="py-1 px-2 text-center">
                      {row.answer === null
                        ? "👁"
                        : isSkip
                          ? "⏭"
                          : row.answer.isCorrect === true
                            ? "✅"
                            : row.answer.isCorrect === false
                              ? "❌"
                              : "⏳"}
                    </td>
                    <td className="py-1 px-2 text-center">
                      {row.totalViewCount != null ? (
                        <span
                          className={`text-[10px] font-bold tabular-nums ${
                            row.totalViewCount >= 5
                              ? "text-red-500"
                              : row.totalViewCount >= 3
                                ? "text-orange-500"
                                : row.totalViewCount >= 2
                                  ? "text-amber-500"
                                  : "text-zinc-400"
                          }`}
                        >
                          {row.totalViewCount}×
                        </span>
                      ) : (
                        <span className="text-zinc-300 text-[9px]">—</span>
                      )}
                    </td>

                    <td className="py-1 px-2 text-zinc-400 tabular-nums text-right">
                      {fmtMs(row.answer?.timeSpentMs)}
                    </td>

                    {/* Session (short) */}
                    <td className="py-1 px-2">
                      <code className="text-[9px] text-zinc-300 dark:text-zinc-600 font-mono">
                        {row.sessionId?.slice(0, 8)}
                      </code>
                    </td>

                    {/* Date */}
                    <td className="py-1 px-2 text-zinc-400 tabular-nums whitespace-nowrap">
                      {fmtDate(row.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="py-1 px-2">
                      <div className="flex gap-0.5">
                        <button
                          onClick={() => setExpanded(isExp ? null : row.id)}
                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-100 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 hover:bg-sky-200 transition-all"
                          title="Pokaż/schowaj JSON"
                        >
                          {isExp ? "▲" : "👁"}
                        </button>
                        <button
                          onClick={() => copy(q, `q${row.id}`)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all ${
                            copied === `q${row.id}`
                              ? "bg-brand-500 text-white"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200"
                          }`}
                          title="Kopiuj JSON pytania"
                        >
                          {copied === `q${row.id}` ? "✓" : "Q"}
                        </button>
                        <button
                          onClick={() =>
                            copy(
                              {
                                id: row.id,
                                questionId: row.questionId,
                                sessionId: row.sessionId,
                                totalViewCount: row.totalViewCount,
                                answer: row.answer,
                                createdAt: row.createdAt,
                              },
                              `a${row.id}`,
                            )
                          }
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all ${
                            copied === `a${row.id}`
                              ? "bg-brand-500 text-white"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200"
                          }`}
                          title="Kopiuj JSON odpowiedzi"
                        >
                          {copied === `a${row.id}` ? "✓" : "A"}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded JSON detail */}
                  {isExp && (
                    <tr key={`exp-${row.id}`}>
                      <td colSpan={12} className="py-0">
                        <div className="grid grid-cols-2 gap-2 px-4 py-3 bg-zinc-50 dark:bg-surface-800 border-b border-zinc-200 dark:border-zinc-700">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                                Pytanie
                              </span>
                              <button
                                onClick={() => copy(q, `qf${row.id}`)}
                                className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${copied === `qf${row.id}` ? "bg-brand-500 text-white" : "text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}
                              >
                                {copied === `qf${row.id}` ? "✓" : "📋"}
                              </button>
                            </div>
                            <pre className="text-[9px] font-mono text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words bg-white dark:bg-surface-900 rounded-lg p-2 border border-zinc-200 dark:border-zinc-700 max-h-[300px] overflow-y-auto select-all leading-relaxed">
                              {JSON.stringify(q, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                                Odpowiedź
                              </span>
                              <button
                                onClick={() =>
                                  copy(
                                    {
                                      id: row.id,
                                      questionId: row.questionId,
                                      sessionId: row.sessionId,
                                      response: row.response,
                                      isCorrect: row.isCorrect,
                                      score: row.score,
                                      xpEarned: row.xpEarned,
                                      timeSpentMs: row.timeSpentMs,
                                      createdAt: row.createdAt,
                                    },
                                    `af${row.id}`,
                                  )
                                }
                                className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${copied === `af${row.id}` ? "bg-brand-500 text-white" : "text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}
                              >
                                {copied === `af${row.id}` ? "✓" : "📋"}
                              </button>
                            </div>
                            <pre className="text-[9px] font-mono text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words bg-white dark:bg-surface-900 rounded-lg p-2 border border-zinc-200 dark:border-zinc-700 max-h-[300px] overflow-y-auto select-all leading-relaxed">
                              {JSON.stringify(
                                {
                                  id: row.id,
                                  questionId: row.questionId,
                                  sessionId: row.sessionId,
                                  totalViewCount: row.totalViewCount,
                                  answer: row.answer,
                                  createdAt: row.createdAt,
                                },
                                null,
                                2,
                              )}
                            </pre>
                            {row.answer?.aiGrading && (
                              <div className="mt-2">
                                <span className="text-[9px] font-bold text-purple-500 uppercase tracking-wider">
                                  🤖 AI Grading
                                </span>
                                <pre className="text-[9px] font-mono text-purple-600 dark:text-purple-400 whitespace-pre-wrap break-words bg-purple-50 dark:bg-purple-900/10 rounded-lg p-2 border border-purple-200 dark:border-purple-800/30 max-h-[200px] overflow-y-auto mt-1">
                                  {JSON.stringify(
                                    row.answer.aiGrading,
                                    null,
                                    2,
                                  )}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 transition-all"
          >
            {loadingMore ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                Ładuję...
              </span>
            ) : (
              `Załaduj kolejne 150 ↓`
            )}
          </button>
        </div>
      )}

      {displayRows.length === 0 && !loading && (
        <p className="text-center py-8 text-xs text-zinc-400">Brak danych.</p>
      )}
    </div>
  );
}
