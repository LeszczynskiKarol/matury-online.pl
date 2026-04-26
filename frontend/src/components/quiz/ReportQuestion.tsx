// ============================================================================
// frontend/src/components/quiz/ReportQuestion.tsx
// Przycisk "Zgłoś zadanie" + modal z formularzem
// ============================================================================

import { useState, useCallback } from "react";

const API = import.meta.env.PUBLIC_API_URL || "/api";

const CATEGORIES = [
  {
    id: "WRONG_ANSWER",
    icon: "❌",
    label: "Błędna odpowiedź",
    desc: "Poprawna odpowiedź jest inna niż wskazana",
  },
  {
    id: "CONTENT_ERROR",
    icon: "📝",
    label: "Błąd w treści",
    desc: "Literówka, błąd merytoryczny, niepoprawne dane",
  },
  {
    id: "UNCLEAR",
    icon: "❓",
    label: "Niejasne sformułowanie",
    desc: "Pytanie jest wieloznaczne lub niezrozumiałe",
  },
  {
    id: "MISSING_CONTENT",
    icon: "🖼️",
    label: "Brakujące dane",
    desc: "Brak obrazka, tabeli, kontekstu lub danych",
  },
  {
    id: "DISPLAY_BUG",
    icon: "🐛",
    label: "Problem z wyświetlaniem",
    desc: "Wzory, formatowanie lub layout się psuje",
  },
  {
    id: "OTHER",
    icon: "💬",
    label: "Inne",
    desc: "Inny problem niewymieniony powyżej",
  },
] as const;

interface ReportButtonProps {
  questionId: string;
  questionPreview?: string; // krótki podgląd treści pytania
}

export function ReportButton({
  questionId,
  questionPreview,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium 
                   text-zinc-400 dark:text-zinc-500 
                   hover:text-red-500 dark:hover:text-red-400 
                   hover:bg-red-50 dark:hover:bg-red-900/10 
                   transition-all duration-200"
        title="Zgłoś problem z tym pytaniem"
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
            d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
          />
        </svg>
        Zgłoś
      </button>

      {open && (
        <ReportModal
          questionId={questionId}
          questionPreview={questionPreview}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ReportModal({
  questionId,
  questionPreview,
  onClose,
}: {
  questionId: string;
  questionPreview?: string;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!category || description.trim().length < 5) return;
    setSubmitting(true);

    try {
      const res = await fetch(`${API}/reports`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          category,
          description: description.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({
          ok: false,
          message: data.error || "Nie udało się wysłać zgłoszenia.",
        });
        return;
      }

      setResult({ ok: true, message: data.message });
    } catch (err: any) {
      setResult({
        ok: false,
        message: "Błąd połączenia. Spróbuj ponownie.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [questionId, category, description]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-surface-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display font-bold text-lg flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-red-500"
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
                </span>
                Zgłoś problem
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Pomóż nam poprawić jakość pytań
              </p>
            </div>
            <button
              onClick={onClose}
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
        </div>

        {/* Sukces / Błąd */}
        {result ? (
          <div className="p-6 text-center">
            <div
              className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                result.ok
                  ? "bg-brand-100 dark:bg-brand-900/20"
                  : "bg-red-100 dark:bg-red-900/20"
              }`}
            >
              <span className="text-3xl">{result.ok ? "✅" : "⚠️"}</span>
            </div>
            <p
              className={`text-sm font-medium ${result.ok ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400"}`}
            >
              {result.message}
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2.5 rounded-2xl text-sm font-semibold bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-surface-700 transition-all"
            >
              Zamknij
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Question preview */}
            {questionPreview && (
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-surface-800 border border-zinc-200 dark:border-zinc-700">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Dotyczy pytania
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {questionPreview}
                </p>
              </div>
            )}

            {/* Category selection */}
            <div>
              <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">
                Rodzaj problemu
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`text-left p-3 rounded-xl border-2 transition-all duration-150 ${
                      category === cat.id
                        ? "border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-900/15 shadow-sm"
                        : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-surface-800 hover:border-zinc-300 dark:hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-base">{cat.icon}</span>
                      <span
                        className={`text-xs font-semibold ${
                          category === cat.id
                            ? "text-red-700 dark:text-red-400"
                            : "text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {cat.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-tight">
                      {cat.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">
                Opis problemu{" "}
                <span className="font-normal text-zinc-400">
                  (min. 5 znaków)
                </span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-surface-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400 transition-all"
                placeholder='Opisz co jest nie tak — np. "Poprawna odpowiedź to B, nie C, ponieważ..."'
              />
              <p className="text-right text-[10px] text-zinc-400 mt-1">
                {description.length}/2000
              </p>
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-5 py-3 rounded-2xl text-sm font-semibold bg-zinc-100 dark:bg-surface-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-surface-700 transition-all"
              >
                Anuluj
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  !category || description.trim().length < 5 || submitting
                }
                className="flex-1 px-5 py-3 rounded-2xl text-sm font-semibold bg-red-500 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? (
                  <span className="flex items-center gap-2 justify-center">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Wysyłam...
                  </span>
                ) : (
                  "Wyślij zgłoszenie"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
