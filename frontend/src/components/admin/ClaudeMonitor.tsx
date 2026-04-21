// ============================================================================
// ClaudeMonitor — Admin panel for monitoring all Claude API usage
// frontend/src/components/admin/ClaudeMonitor.tsx
// ============================================================================

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.PUBLIC_API_URL || "/api";

async function apiGet(path: string) {
  const res = await fetch(`${API}${path}`, { credentials: "include" });
  return res.json();
}

export function ClaudeMonitor() {
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [filters, setFilters] = useState({ caller: "", offset: 0, limit: 20 });
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  // Load stats
  useEffect(() => {
    apiGet(`/admin/claude/stats?days=${days}`)
      .then(setStats)
      .catch(console.error);
  }, [days]);

  // Load logs
  const loadLogs = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      limit: String(filters.limit),
      offset: String(filters.offset),
      ...(filters.caller ? { caller: filters.caller } : {}),
    }).toString();
    apiGet(`/admin/claude/logs?${qs}`)
      .then((d) => {
        setLogs(d.logs);
        setLogsTotal(d.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Load full log detail
  const openLog = async (id: string) => {
    const data = await apiGet(`/admin/claude/logs/${id}`);
    setSelectedLog(data);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-xl">
            🤖 Claude API Monitor
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Każdy request, każda odpowiedź, każdy grosz
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${days === d ? "bg-brand-500 text-white" : "bg-zinc-100 dark:bg-surface-800 text-zinc-500"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats Cards ───────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Requesty" value={stats.totals.requests} icon="📡" />
          <StatCard
            label="Koszt"
            value={`$${stats.totals.costUsd.toFixed(4)}`}
            icon="💰"
            accent
          />
          <StatCard
            label="Input tok."
            value={formatNum(stats.totals.inputTokens)}
            icon="📥"
          />
          <StatCard
            label="Output tok."
            value={formatNum(stats.totals.outputTokens)}
            icon="📤"
          />
          <StatCard label="Błędy" value={stats.recentErrors.length} icon="❌" />
        </div>
      )}

      {/* ── Cost Chart (simple bar) ───────────────────────────────────── */}
      {stats?.dailyCosts?.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-display font-semibold text-sm mb-4">
            Koszty dzienne
          </h3>
          <div className="flex items-end gap-1 h-32">
            {stats.dailyCosts.map((d: any, i: number) => {
              const maxCost = Math.max(
                ...stats.dailyCosts.map((x: any) => x.cost || 0),
                0.001,
              );
              const h = Math.max(4, ((d.cost || 0) / maxCost) * 100);
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${d.date}: $${(d.cost || 0).toFixed(4)} (${d.count} req)`}
                >
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-brand-500 to-brand-400 transition-all hover:from-brand-600 hover:to-brand-500"
                    style={{ height: `${h}%` }}
                  />
                  {i % Math.ceil(stats.dailyCosts.length / 7) === 0 && (
                    <span className="text-[8px] text-zinc-400">
                      {String(d.date).slice(5, 10)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Caller Breakdown ──────────────────────────────────────────── */}
      {stats?.callerBreakdown?.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <h3 className="font-display font-semibold text-sm mb-3">
              Per caller
            </h3>
            <div className="space-y-2">
              {stats.callerBreakdown.map((c: any) => (
                <div key={c.caller} className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      setFilters({ ...filters, caller: c.caller, offset: 0 })
                    }
                    className="text-xs font-mono font-semibold text-brand-600 hover:underline w-40 text-left truncate"
                  >
                    {c.caller}
                  </button>
                  <div className="flex-1 progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${(c.totalCost / Math.max(...stats.callerBreakdown.map((x: any) => x.totalCost))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono w-20 text-right">
                    ${(c.totalCost || 0).toFixed(4)}
                  </span>
                  <span className="text-[10px] text-zinc-400 w-12 text-right">
                    {c.count}×
                  </span>
                  {c.errors > 0 && (
                    <span className="text-[10px] text-red-500">
                      {c.errors}err
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="font-display font-semibold text-sm mb-3">
              Per model
            </h3>
            <div className="space-y-2">
              {stats.modelBreakdown.map((m: any) => (
                <div key={m.model} className="flex items-center gap-3">
                  <span className="text-xs font-mono w-40 truncate">
                    {m.model}
                  </span>
                  <span className="text-xs font-mono w-20 text-right">
                    ${(m.totalCost || 0).toFixed(4)}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {m.count}× · avg {m.avgDuration}ms
                  </span>
                </div>
              ))}
            </div>

            {stats.recentErrors.length > 0 && (
              <>
                <h3 className="font-display font-semibold text-sm mt-5 mb-2 text-red-500">
                  Ostatnie błędy
                </h3>
                <div className="space-y-1.5">
                  {stats.recentErrors.slice(0, 5).map((e: any) => (
                    <div
                      key={e.id}
                      className="text-xs p-2 rounded-lg bg-red-50 dark:bg-red-900/10"
                    >
                      <span className="font-mono text-red-600">{e.caller}</span>
                      <span className="text-zinc-500 ml-2">
                        {e.error?.slice(0, 80)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Logs Table ────────────────────────────────────────────────── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-sm">
            Request Log
            {filters.caller && (
              <span className="ml-2 px-2 py-0.5 rounded-lg bg-brand-100 dark:bg-brand-900/20 text-brand-600 text-[10px]">
                {filters.caller}
                <button
                  onClick={() =>
                    setFilters({ ...filters, caller: "", offset: 0 })
                  }
                  className="ml-1 hover:text-red-500"
                >
                  ✕
                </button>
              </span>
            )}
          </h3>
          <span className="text-xs text-zinc-400">{logsTotal} total</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left">
                <th className="py-2 px-2 font-medium text-zinc-500">Czas</th>
                <th className="py-2 px-2 font-medium text-zinc-500">Caller</th>
                <th className="py-2 px-2 font-medium text-zinc-500">Model</th>
                <th className="py-2 px-2 font-medium text-zinc-500">Tokeny</th>
                <th className="py-2 px-2 font-medium text-zinc-500">Koszt</th>
                <th className="py-2 px-2 font-medium text-zinc-500">Czas</th>
                <th className="py-2 px-2 font-medium text-zinc-500">Status</th>
                <th className="py-2 px-2 font-medium text-zinc-500"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-surface-800"
                >
                  <td className="py-2 px-2 font-mono text-zinc-500">
                    {new Date(log.createdAt).toLocaleString("pl", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </td>
                  <td className="py-2 px-2">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">
                      {log.caller}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-zinc-500">
                    {log.model.replace("claude-", "")}
                  </td>
                  <td className="py-2 px-2 font-mono">
                    <span className="text-blue-500">{log.inputTokens}</span>
                    <span className="text-zinc-400 mx-0.5">→</span>
                    <span className="text-green-500">{log.outputTokens}</span>
                  </td>
                  <td className="py-2 px-2 font-mono font-semibold">
                    ${log.costUsd.toFixed(4)}
                  </td>
                  <td className="py-2 px-2 font-mono text-zinc-500">
                    {(log.durationMs / 1000).toFixed(1)}s
                  </td>
                  <td className="py-2 px-2">
                    {log.success ? (
                      <span className="text-brand-500">✓</span>
                    ) : (
                      <span className="text-red-500" title={log.error}>
                        ✗
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <button
                      onClick={() => openLog(log.id)}
                      className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-600 font-mono"
                    >
                      {"{}"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3">
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
            {Math.min(filters.offset + filters.limit, logsTotal)} z {logsTotal}
          </span>
          <button
            disabled={filters.offset + filters.limit >= logsTotal}
            onClick={() =>
              setFilters({ ...filters, offset: filters.offset + filters.limit })
            }
            className="btn-ghost text-xs disabled:opacity-30"
          >
            Następne →
          </button>
        </div>
      </div>

      {/* ── Log Detail Modal ──────────────────────────────────────────── */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="glass-card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">Request Detail</h2>
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-1 rounded-lg text-xs font-semibold ${selectedLog.success ? "bg-brand-100 text-brand-700" : "bg-red-100 text-red-700"}`}
                >
                  {selectedLog.success ? "SUCCESS" : "ERROR"}
                </span>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-lg hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Meta chips */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip label="Caller" value={selectedLog.caller} />
              <Chip label="Model" value={selectedLog.model} />
              <Chip label="Input" value={`${selectedLog.inputTokens} tok`} />
              <Chip label="Output" value={`${selectedLog.outputTokens} tok`} />
              <Chip label="Cost" value={`$${selectedLog.costUsd.toFixed(4)}`} />
              <Chip label="Duration" value={`${selectedLog.durationMs}ms`} />
              {selectedLog.userId && (
                <Chip label="User" value={selectedLog.userId} />
              )}
              {selectedLog.questionId && (
                <Chip label="Question" value={selectedLog.questionId} />
              )}
            </div>

            {/* System prompt */}
            {selectedLog.systemPrompt && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-zinc-500">
                    SYSTEM PROMPT
                  </span>
                  <CopyBtn text={selectedLog.systemPrompt} />
                </div>
                <pre className="text-xs font-mono bg-purple-50 dark:bg-purple-900/10 p-3 rounded-xl max-h-40 overflow-auto whitespace-pre-wrap">
                  {selectedLog.systemPrompt}
                </pre>
              </div>
            )}

            {/* User prompt */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-zinc-500">
                  USER PROMPT
                </span>
                <CopyBtn text={selectedLog.userPrompt} />
              </div>
              <pre className="text-xs font-mono bg-blue-50 dark:bg-blue-900/10 p-3 rounded-xl max-h-60 overflow-auto whitespace-pre-wrap">
                {selectedLog.userPrompt}
              </pre>
            </div>

            {/* Response */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-zinc-500">
                  RESPONSE
                </span>
                <CopyBtn text={selectedLog.rawResponse} />
              </div>
              <pre className="text-xs font-mono bg-green-50 dark:bg-green-900/10 p-3 rounded-xl max-h-60 overflow-auto whitespace-pre-wrap">
                {selectedLog.rawResponse}
              </pre>
            </div>

            {/* Error */}
            {selectedLog.error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 text-sm text-red-600">
                {selectedLog.error}
              </div>
            )}

            {/* Metadata */}
            {selectedLog.metadata && (
              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600">
                  Metadata
                </summary>
                <pre className="mt-2 font-mono bg-zinc-50 dark:bg-surface-900 p-3 rounded-xl overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: any;
  icon: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`stat-card ${accent ? "ring-1 ring-brand-200 dark:ring-brand-800/30" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <div
          className={`font-display font-bold text-xl ${accent ? "text-brand-600" : ""}`}
        >
          {value}
        </div>
      </div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-surface-800">
      <span className="text-zinc-400">{label}:</span>
      <span className="font-semibold text-zinc-700 dark:text-zinc-300 font-mono">
        {value}
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
      className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500 hover:text-zinc-700"
    >
      {copied ? "✓" : "Copy"}
    </button>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
