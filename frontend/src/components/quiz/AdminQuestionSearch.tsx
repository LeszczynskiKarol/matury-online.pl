// ══════════════════════════════════════════════════════════════════════════
// AdminQuestionSearch — wyszukiwarka pytań dla adminów w QuizPlayer
// Wklej ten komponent DO PLIKU QuizPlayer.tsx (przed lub po LiveFilterBar)
// ══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from "react";
import { admin as adminApi } from "../../lib/api";
import { ChemText } from "./Chem";

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
  subjectId: string;
  onSelectQuestion: (question: any) => void;
}

export function AdminQuestionSearch({
  subjectId,
  onSelectQuestion,
}: AdminQuestionSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchById, setSearchById] = useState(false);
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
          subjectId,
          limit: 15,
        };

        // Detect if searching by ID (UUID-like or short prefix)
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
    [subjectId, searchById],
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
                : "Szukaj pytania (treść, temat)…"
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
        <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-bold uppercase tracking-wider border border-amber-200 dark:border-amber-800/30">
          🔑 Admin
        </span>
      </div>

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-2 max-h-[400px] overflow-y-auto rounded-2xl bg-white dark:bg-surface-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl shadow-zinc-200/50 dark:shadow-black/30">
          <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              {total} wynik{total === 1 ? "" : total < 5 ? "i" : "ów"}
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
            <button
              key={q.id}
              onClick={() => handleSelect(q)}
              className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-surface-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 group"
            >
              <div className="flex items-center gap-2 mb-1">
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
                <span className="text-[10px] text-zinc-400 ml-auto truncate max-w-[120px]">
                  {q.topic?.name || "—"}
                </span>

                {/* Points */}
                <span className="text-[10px] text-zinc-400">
                  {q.points} pkt
                </span>
              </div>

              {/* Question preview */}
              <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 group-hover:text-zinc-800 dark:group-hover:text-zinc-200 transition-colors">
                {getQuestionPreview(q)}
              </p>

              {/* ID (tiny) */}
              <p className="text-[9px] text-zinc-300 dark:text-zinc-600 mt-1 font-mono truncate">
                {q.id}
              </p>
            </button>
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
  );
}
