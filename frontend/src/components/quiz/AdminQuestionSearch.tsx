// ══════════════════════════════════════════════════════════════════════════
// AdminQuestionSearch — GLOBALNA wyszukiwarka pytań dla adminów
// Plik: src/components/quiz/AdminQuestionSearch.tsx
// ══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from "react";
import { admin as adminApi } from "../../lib/api";

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

interface AdminQuestionSearchProps {
  onSelectQuestion: (question: any) => void;
}

export function AdminQuestionSearch({
  onSelectQuestion,
}: AdminQuestionSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchById, setSearchById] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Clear copied tooltip
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const doSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      try {
        const params: Record<string, any> = {
          limit: 20,
          // BRAK subjectId → szuka GLOBALNIE po wszystkich przedmiotach
        };

        if (searchById || /^[a-f0-9-]{8,}$/i.test(searchQuery.trim())) {
          params.id = searchQuery.trim();
        } else {
          params.search = searchQuery.trim();
        }

        const data = await adminApi.questions(params);
        setResults(data.questions || []);
        setTotal(data.total || 0);
        setOpen(true);
      } catch (err) {
        console.error("Admin search error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [searchById],
  );

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 350);
  };

  const handleSelect = (question: any) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    onSelectQuestion(question);
  };

  const handleCopyJson = async (e: React.MouseEvent, question: any) => {
    e.stopPropagation();
    try {
      const full = await adminApi.getQuestion(question.id);
      await navigator.clipboard.writeText(JSON.stringify(full, null, 2));
      setCopied(question.id);
    } catch {
      try {
        await navigator.clipboard.writeText(JSON.stringify(question, null, 2));
        setCopied(question.id);
      } catch (err) {
        console.error("Copy failed:", err);
      }
    }
  };

  const handlePreview = async (e: React.MouseEvent, question: any) => {
    e.stopPropagation();
    try {
      const full = await adminApi.getQuestion(question.id);
      setPreview(full);
    } catch {
      setPreview(question);
    }
  };

  const truncate = (text: string, max: number = 80) => {
    if (!text) return "—";
    const clean = text.replace(/\n/g, " ").trim();
    return clean.length > max ? clean.slice(0, max) + "…" : clean;
  };

  const getQuestionPreview = (q: any) => {
    const c = q.content;
    if (typeof c === "string") return truncate(c);
    if (c?.question) return truncate(c.question);
    if (c?.context) return truncate(c.context);
    if (c?.instruction) return truncate(c.instruction);
    if (c?.prompt) return truncate(c.prompt);
    return truncate(JSON.stringify(c));
  };

  return (
    <>
      <div ref={containerRef} className="mb-4 relative">
        <div className="flex items-center gap-2">
          {/* Search icon + input */}
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500">
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              placeholder={
                searchById
                  ? "Wklej ID pytania (UUID)…"
                  : "Szukaj pytania globalnie (treść, temat, przedmiot)…"
              }
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 text-zinc-800 dark:text-zinc-200 placeholder-amber-400 dark:placeholder-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
            />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Toggle: search by content vs ID */}
          <button
            onClick={() => setSearchById(!searchById)}
            className={`px-3 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
              searchById
                ? "bg-amber-500 text-white shadow-md"
                : "bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30"
            }`}
            title={searchById ? "Szukam po ID" : "Szukam po treści"}
          >
            {searchById ? "ID" : "Treść"}
          </button>

          {/* Admin badge */}
          <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-bold uppercase tracking-wider border border-amber-200 dark:border-amber-800/30 whitespace-nowrap">
            🔑 Global
          </span>
        </div>

        {/* Results dropdown */}
        {open && results.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-2 max-h-[450px] overflow-y-auto rounded-2xl bg-white dark:bg-surface-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl shadow-zinc-200/50 dark:shadow-black/30">
            <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white dark:bg-surface-900 z-10">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                {total} wynik{total === 1 ? "" : total < 5 ? "i" : "ów"}{" "}
                (globalnie)
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {results.map((q) => (
              <div
                key={q.id}
                className="px-4 py-3 hover:bg-zinc-50 dark:hover:bg-surface-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
              >
                {/* Row 1: badges */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {/* Subject badge */}
                  {q.subject?.name && (
                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                      {q.subject.name}
                    </span>
                  )}

                  {/* Type badge */}
                  <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                    {TYPE_LABELS[q.type] || q.type}
                  </span>

                  {/* Difficulty dots */}
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${
                          i <= q.difficulty
                            ? "bg-amber-500"
                            : "bg-zinc-200 dark:bg-zinc-700"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Topic */}
                  <span className="text-[10px] text-zinc-400 ml-auto truncate max-w-[140px]">
                    {q.topic?.name || "—"}
                  </span>

                  {/* Points */}
                  <span className="text-[10px] text-zinc-400">
                    {q.points} pkt
                  </span>
                </div>

                {/* Row 2: question preview */}
                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-2">
                  {getQuestionPreview(q)}
                </p>

                {/* Row 3: ID + action buttons */}
                <div className="flex items-center gap-2">
                  <p className="text-[9px] text-zinc-300 dark:text-zinc-600 font-mono truncate flex-1">
                    {q.id}
                  </p>

                  {/* Pokaż — preview modal */}
                  <button
                    onClick={(e) => handlePreview(e, q)}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 hover:bg-sky-200 dark:hover:bg-sky-900/40 transition-all"
                    title="Podgląd pełnych danych pytania"
                  >
                    👁 Pokaż
                  </button>

                  {/* Kopiuj JSON */}
                  <button
                    onClick={(e) => handleCopyJson(e, q)}
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold transition-all ${
                      copied === q.id
                        ? "bg-brand-500 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                    title="Kopiuj pełny JSON pytania do schowka"
                  >
                    {copied === q.id ? "✓ Skopiowano" : "📋 JSON"}
                  </button>

                  {/* Załaduj do quizu */}
                  <button
                    onClick={() => handleSelect(q)}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/40 transition-all"
                    title="Załaduj pytanie do aktualnej sesji quizu"
                  >
                    ▶ Załaduj
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results */}
        {open && query.trim() && !loading && results.length === 0 && (
          <div className="absolute z-50 left-0 right-0 mt-2 p-6 rounded-2xl bg-white dark:bg-surface-900 border border-zinc-200 dark:border-zinc-700 shadow-xl text-center">
            <p className="text-sm text-zinc-400">
              Brak wyników dla „{query.trim()}"
            </p>
          </div>
        )}
      </div>

      {/* ═══ PREVIEW MODAL ═══ */}
      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl max-h-[85vh] rounded-3xl bg-white dark:bg-surface-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl flex flex-col animate-scale-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0 flex-wrap">
              {preview.subject?.name && (
                <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                  {preview.subject.name}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                {TYPE_LABELS[preview.type] || preview.type}
              </span>
              {preview.topic?.name && (
                <span className="text-xs text-zinc-500">
                  {preview.topic.name}
                </span>
              )}
              <span className="text-[10px] text-zinc-400 ml-auto font-mono select-all">
                {preview.id}
              </span>
              <button
                onClick={() => setPreview(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-surface-800 transition-all"
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
            </div>

            {/* Body — scrollable JSON */}
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words leading-relaxed bg-zinc-50 dark:bg-surface-800 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-700 select-all">
                {JSON.stringify(preview, null, 2)}
              </pre>
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 flex-shrink-0">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      JSON.stringify(preview, null, 2),
                    );
                    setCopied(preview.id);
                  } catch {}
                }}
                className={`px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                  copied === preview.id
                    ? "bg-brand-500 text-white"
                    : "bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-surface-700"
                }`}
              >
                {copied === preview.id ? "✓ Skopiowano!" : "📋 Kopiuj JSON"}
              </button>
              <button
                onClick={() => {
                  handleSelect(preview);
                  setPreview(null);
                }}
                className="px-4 py-2.5 rounded-2xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/25 transition-all"
              >
                ▶ Załaduj do quizu
              </button>
              <button
                onClick={() => setPreview(null)}
                className="ml-auto px-4 py-2.5 rounded-2xl text-sm font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
