// ══════════════════════════════════════════════════════════════════════════
// AdminBrowseBar — tryb przeglądania pytań dla admina
// Plik: src/components/quiz/AdminBrowseBar.tsx
// ══════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect } from "react";

const API = import.meta.env.PUBLIC_API_URL || "/api";

export type AdminSort = "newest" | "oldest" | "az" | "za" | null;

interface AdminBrowseBarProps {
  subjectId: string;
  active: AdminSort;
  onActivate: (sort: AdminSort, questions: any[], total: number) => void;
  onDeactivate: () => void;
  currentQuestion: any;
  /** Ile razy admin widział to pytanie (z totalAttempts) */
  seenCount: number;
}

const SORT_OPTIONS: { value: AdminSort; icon: string; label: string }[] = [
  { value: "newest", icon: "🕐↓", label: "Najnowsze" },
  { value: "oldest", icon: "🕐↑", label: "Najstarsze" },
  { value: "az", icon: "A→Z", label: "Temat A→Z" },
  { value: "za", icon: "Z→A", label: "Temat Z→A" },
];

export function AdminBrowseBar({
  subjectId,
  active,
  onActivate,
  onDeactivate,
  currentQuestion,
  seenCount,
}: AdminBrowseBarProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(0);
  const LIMIT = 50;

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 1200);
      return () => clearTimeout(t);
    }
  }, [copied]);

  const loadSorted = useCallback(
    async (sort: AdminSort, offset = 0) => {
      if (!sort) return;
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          subjectId,
          sort,
          limit: String(LIMIT),
          offset: String(offset),
        });
        const res = await fetch(`${API}/questions?${qs}`, {
          credentials: "include",
        });
        const data = await res.json();
        setPage(offset / LIMIT);
        onActivate(sort, data.questions, data.total);
      } catch (e) {
        console.error("Admin browse error:", e);
      } finally {
        setLoading(false);
      }
    },
    [subjectId, onActivate],
  );

  const handleSort = (sort: AdminSort) => {
    if (sort === active) {
      onDeactivate();
      return;
    }
    loadSorted(sort, 0);
  };

  const handleCopyJson = async () => {
    if (!currentQuestion) return;
    try {
      // Fetch full question from admin endpoint for complete data
      const res = await fetch(`${API}/admin/questions/${currentQuestion.id}`, {
        credentials: "include",
      });
      const full = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(full, null, 2));
      setCopied(true);
    } catch {
      try {
        await navigator.clipboard.writeText(
          JSON.stringify(currentQuestion, null, 2),
        );
        setCopied(true);
      } catch {}
    }
  };

  return (
    <div className="mb-3 p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
      {/* Row 1: Sort buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mr-1">
          Przeglądaj:
        </span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleSort(opt.value)}
            disabled={loading}
            className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold transition-all ${
              active === opt.value
                ? "bg-amber-500 text-white shadow-md"
                : "bg-white dark:bg-surface-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 hover:border-amber-300"
            }`}
          >
            <span className="mr-1">{opt.icon}</span>
            {opt.label}
          </button>
        ))}

        {loading && (
          <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin ml-1" />
        )}

        {active && (
          <button
            onClick={onDeactivate}
            className="text-[9px] text-zinc-400 hover:text-red-500 transition-colors ml-auto"
          >
            ✕ Wyłącz
          </button>
        )}
      </div>

      {/* Row 2: Question meta (visible when question loaded) */}
      {currentQuestion && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-200/50 dark:border-amber-800/20">
          {/* Seen count */}
          <span
            className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${
              seenCount === 0
                ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600"
                : seenCount <= 2
                  ? "bg-sky-100 dark:bg-sky-900/20 text-sky-600"
                  : seenCount <= 5
                    ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600"
                    : "bg-red-100 dark:bg-red-900/20 text-red-600"
            }`}
          >
            👁 {seenCount}× widziane
          </span>

          {/* Question ID */}
          <code className="text-[9px] font-mono text-zinc-400 select-all truncate max-w-[180px]">
            {currentQuestion.id}
          </code>

          {/* Created date if available */}
          {currentQuestion.createdAt && (
            <span className="text-[9px] text-zinc-400">
              {new Date(currentQuestion.createdAt).toLocaleDateString("pl")}
            </span>
          )}

          {/* Copy JSON */}
          <button
            onClick={handleCopyJson}
            className={`ml-auto px-2.5 py-1 rounded-xl text-[10px] font-semibold transition-all ${
              copied
                ? "bg-brand-500 text-white"
                : "bg-white dark:bg-surface-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            }`}
          >
            {copied ? "✓ Skopiowano" : "📋 JSON"}
          </button>
        </div>
      )}
    </div>
  );
}
