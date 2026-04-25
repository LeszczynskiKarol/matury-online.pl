// ============================================================================
// BiologyQuestions.tsx

// ── Wspólny FeedbackBlock re-export (kopiuj z QuizPlayer lub przenieś do shared) ──

import { ChemText, Chem } from "./Chem";

function MiniFeedback({ feedback }: any) {
  if (!feedback) return null;

  // "Pokaż odpowiedź" — neutralny styl, bez oceny
  if (feedback.revealed) {
    return (
      <div className="mt-6 p-4 rounded-2xl animate-slide-up bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800/30">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">💡</span>
          <span className="font-display font-semibold text-sm">
            Poprawna odpowiedź
          </span>
        </div>
        {feedback.explanation && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
            {feedback.explanation}
          </p>
        )}
      </div>
    );
  }

  // Normalny feedback po sprawdzeniu
  return (
    <div
      className={`mt-6 p-4 rounded-2xl animate-slide-up ${feedback.isCorrect ? "bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/30" : "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{feedback.isCorrect ? "✅" : "❌"}</span>
          <span className="font-display font-semibold text-sm">
            {feedback.isCorrect ? "Poprawnie!" : "Sprawdź rozwiązanie"}
          </span>
        </div>
        <span className="xp-badge">+{feedback.xpEarned} XP</span>
      </div>
      {feedback.explanation && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
          {feedback.explanation}
        </p>
      )}
      {feedback.aiGrading?.feedback && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
          {feedback.aiGrading.feedback}
        </p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1) DIAGRAM_LABEL — opis elementów rysunku/schematu
// ════════════════════════════════════════════════════════════════════════════
//
// content: {
//   question: string,
//   imageUrl: string,
//   imageCaption?: string,              // źródło / autor / licencja
//   imageAlt?: string,
//   labels: [
//     { id: "1", question: "Element oznaczony numerem 1",
//       acceptedAnswers: ["matriks", "matrix"] }
//   ],
//   maxPoints?: number
// }

export function DiagramLabelQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as Record<string, string>) || {};
  const isA = feedback !== null;

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-4">
        <ChemText text={content.question} />
      </h3>

      {/* Obraz / schemat */}
      <figure className="mb-6 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <img
          src={content.imageUrl}
          alt={content.imageAlt || content.imageCaption || "Schemat"}
          className="w-full h-auto max-h-[500px] object-contain bg-white"
          loading="lazy"
        />
        {content.imageCaption && (
          <figcaption className="text-[11px] text-zinc-500 dark:text-zinc-400 p-2 border-t border-zinc-100 dark:border-zinc-800 italic">
            {content.imageCaption}
          </figcaption>
        )}
      </figure>

      {/* Pola etykiet */}
      <div className="space-y-3">
        {content.labels.map((lbl: any, i: number) => {
          const userAnswer = (ans[lbl.id] || "").toLowerCase().trim();
          const ok =
            isA &&
            lbl.acceptedAnswers.some(
              (a: string) => a.toLowerCase().trim() === userAnswer,
            );
          return (
            <div key={lbl.id} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-xl bg-navy-500 text-white flex items-center justify-center text-sm font-bold">
                {lbl.id}
              </span>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1.5">
                  {lbl.question}
                </label>
                <input
                  type="text"
                  value={ans[lbl.id] || ""}
                  onChange={(e) =>
                    !disabled && onChange({ ...ans, [lbl.id]: e.target.value })
                  }
                  disabled={disabled}
                  className={`input ${isA ? (ok ? "!border-brand-500" : "!border-red-500") : ""}`}
                  placeholder="Wpisz nazwę..."
                />
                {isA && !ok && (
                  <p className="text-xs mt-1 text-brand-600">
                    Poprawna: {lbl.acceptedAnswers[0]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <MiniFeedback feedback={feedback} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2) EXPERIMENT_DESIGN — projekt doświadczenia
// ════════════════════════════════════════════════════════════════════════════
//
// content: {
//   question: string,
//   context?: string,                   // opis sytuacji badawczej
//   fields: [
//     { id: "hypothesis", label: "Hipoteza", placeholder: "...",
//       rubric: "kryteria oceny", sampleAnswer: "...", points: 1 }
//   ],
//   maxPoints: number
// }

export function ExperimentDesignQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as Record<string, string>) || {};
  const isA = feedback !== null;

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-4">
        <ChemText text={content.question} />
      </h3>

      {content.context && (
        <div className="p-4 rounded-2xl bg-navy-50 dark:bg-navy-900/10 border border-navy-200 dark:border-navy-800/30 mb-6">
          <p className="text-sm whitespace-pre-line text-zinc-700 dark:text-zinc-300">
            <ChemText text={content.context} />
          </p>
        </div>
      )}

      <div className="space-y-5">
        {content.fields.map((f: any, i: number) => (
          <div
            key={f.id}
            className="p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">
                {String.fromCharCode(97 + i)}
              </span>
              <span className="text-sm font-semibold">{f.label}</span>
              {f.points && (
                <span className="ml-auto text-xs text-zinc-400">
                  {f.points} pkt
                </span>
              )}
            </div>
            {f.rubric && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2 italic">
                Kryteria: {f.rubric}
              </p>
            )}
            <textarea
              value={ans[f.id] || ""}
              onChange={(e) =>
                !disabled && onChange({ ...ans, [f.id]: e.target.value })
              }
              disabled={disabled}
              rows={f.rows || 3}
              className="input resize-none text-sm"
              placeholder={f.placeholder || "Sformułuj odpowiedź..."}
            />
            {isA && feedback?.aiGrading?.fields?.[f.id] && (
              <div
                className={`mt-2 p-3 rounded-xl border ${feedback.aiGrading.fields[f.id].score >= 0.5 ? "bg-brand-50 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800/30" : "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">
                    {feedback.aiGrading.fields[f.id].score >= 0.5 ? "✅" : "❌"}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {feedback.aiGrading.fields[f.id].pointsEarned ?? 0}/
                    {f.points || 1} pkt
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {feedback.aiGrading.fields[f.id].feedback}
                </p>
              </div>
            )}
            {isA && f.sampleAnswer && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-brand-600 dark:text-brand-400 font-medium">
                  Przykładowa odpowiedź
                </summary>
                <p className="mt-2 p-2 rounded-lg bg-white dark:bg-surface-900 text-zinc-600 dark:text-zinc-400">
                  {f.sampleAnswer}
                </p>
              </details>
            )}
          </div>
        ))}
      </div>

      <MiniFeedback feedback={feedback} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3) CROSS_PUNNETT — krzyżówka genetyczna z tabelą Punnetta
// ════════════════════════════════════════════════════════════════════════════
//
// content: {
//   question: string,
//   context?: string,
//   parents: {
//     mother: { label: "Matka", acceptedGenotypes: ["IAIB", "IBIA"] },
//     father: { label: "Ojciec", acceptedGenotypes: ["ii"] }
//   },
//   motherGametes: ["IA", "IB"],         // gametes jako wskazówka (opcjonalne)
//   fatherGametes: ["i", "i"],
//   punnettGrid: true,                    // czy pokazać tabelę do wypełnienia
//   questions: [
//     { id: "phenotypes", label: "Możliwe grupy krwi potomstwa",
//       acceptedAnswers: ["A, B", "A i B", "A, B"] },
//     { id: "probAB", label: "P(grupa AB) =", unit: "%",
//       expectedValue: 0, tolerance: 0 }
//   ]
// }

export function CrossPunnettQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as Record<string, any>) || {};
  const isA = feedback !== null;
  const set = (k: string, v: any) => !disabled && onChange({ ...ans, [k]: v });

  const motherGametes = content.motherGametes || [];
  const fatherGametes = content.fatherGametes || [];

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-4">
        <ChemText text={content.question} />
      </h3>

      {content.context && (
        <div className="p-4 rounded-2xl bg-navy-50 dark:bg-navy-900/10 border border-navy-200 dark:border-navy-800/30 mb-5">
          <p className="text-sm whitespace-pre-line">
            <ChemText text={content.context} />
          </p>
        </div>
      )}

      {/* Genotypy rodziców */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-pink-50 dark:bg-pink-900/10 border border-pink-200 dark:border-pink-800/30">
          <label className="block text-xs font-bold text-pink-700 dark:text-pink-400 mb-1">
            ♀ {content.parents.mother.label}
          </label>
          <input
            type="text"
            value={ans.motherGenotype || ""}
            onChange={(e) => set("motherGenotype", e.target.value)}
            disabled={disabled}
            placeholder="np. IAIB"
            className="input font-mono"
          />
        </div>
        <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800/30">
          <label className="block text-xs font-bold text-sky-700 dark:text-sky-400 mb-1">
            ♂ {content.parents.father.label}
          </label>
          <input
            type="text"
            value={ans.fatherGenotype || ""}
            onChange={(e) => set("fatherGenotype", e.target.value)}
            disabled={disabled}
            placeholder="np. ii"
            className="input font-mono"
          />
        </div>
      </div>

      {/* Tabela Punnetta */}
      {content.punnettGrid && motherGametes.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
            Tabela krzyżówki
          </p>
          <div className="inline-block rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="w-16 h-12 bg-zinc-100 dark:bg-surface-800"></th>
                  {fatherGametes.map((g: string, i: number) => (
                    <th
                      key={i}
                      className="w-16 h-12 bg-sky-100 dark:bg-sky-900/20 font-mono text-sm border border-zinc-200 dark:border-zinc-700"
                    >
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {motherGametes.map((mg: string, ri: number) => (
                  <tr key={ri}>
                    <th className="w-16 h-14 bg-pink-100 dark:bg-pink-900/20 font-mono text-sm border border-zinc-200 dark:border-zinc-700">
                      {mg}
                    </th>
                    {fatherGametes.map((fg: string, ci: number) => {
                      const cellKey = `cell_${ri}_${ci}`;
                      return (
                        <td
                          key={ci}
                          className="w-16 h-14 border border-zinc-200 dark:border-zinc-700 p-0"
                        >
                          <input
                            type="text"
                            value={ans[cellKey] || ""}
                            onChange={(e) => set(cellKey, e.target.value)}
                            disabled={disabled}
                            className="w-full h-full text-center font-mono text-sm bg-white dark:bg-surface-900 outline-none focus:bg-brand-50 dark:focus:bg-brand-900/10"
                            placeholder="..."
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pytania szczegółowe */}
      <div className="space-y-3">
        {content.questions?.map((q: any) => {
          const uv = (ans[q.id] || "").trim().toLowerCase();
          const deterministicOk =
            isA &&
            q.acceptedAnswers?.some(
              (a: string) => a.toLowerCase().trim() === uv,
            );
          const aiOk =
            isA && feedback?.aiGrading?.questions?.[q.id]?.score >= 0.5;
          const ok = deterministicOk || aiOk;

          return (
            <div key={q.id}>
              <label className="block text-sm font-medium mb-1.5">
                {q.label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ans[q.id] || ""}
                  onChange={(e) => set(q.id, e.target.value)}
                  disabled={disabled}
                  className={`input ${isA ? (ok ? "!border-brand-500" : "!border-red-500") : ""}`}
                  placeholder="Odpowiedź..."
                />
                {q.unit && (
                  <span className="text-sm text-zinc-500 font-medium">
                    {q.unit}
                  </span>
                )}
              </div>
              {isA && feedback?.aiGrading?.questions?.[q.id] && (
                <div
                  className={`mt-2 p-3 rounded-xl border ${feedback.aiGrading.questions[q.id].score >= 0.5 ? "bg-brand-50 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800/30" : "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">
                      {feedback.aiGrading.questions[q.id].score >= 0.5
                        ? "✅"
                        : "❌"}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Ocena AI
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {feedback.aiGrading.questions[q.id].feedback}
                  </p>
                </div>
              )}
              {isA && !ok && !feedback?.aiGrading?.questions?.[q.id] && (
                <p className="text-xs mt-1 text-brand-600">
                  Poprawna: {q.acceptedAnswers?.[0]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <MiniFeedback feedback={feedback} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 4) CALCULATION — obliczenia z jednostką i tolerancją
// ════════════════════════════════════════════════════════════════════════════
//
// content: {
//   question: string,
//   context?: string,
//   givens?: [{ label: "Średnia masa aminokwasu", value: "110 Da" }],
//   formula?: string,                    // opcjonalna podpowiedź wzoru
//   showSteps: boolean,                  // czy pole na tok rozumowania
//   answer: {
//     expectedValue: number,             // LUB tolerance-based
//     unit: string,                      // np. "g/mol", "%", "mol"
//     tolerance?: number,                // ± tolerance
//     acceptedValues?: (number|string)[] // alternatywne poprawne odpowiedzi
//   }
// }

export function CalculationQuestion({
  content,
  response,
  onChange,
  disabled,
  feedback,
}: any) {
  const ans = (response as Record<string, string>) || {};
  const isA = feedback !== null;
  const set = (k: string, v: string) =>
    !disabled && onChange({ ...ans, [k]: v });

  // Ocena lokalna (heurystyczna, pełna ocena po stronie backendu)
  const userNum = parseFloat(ans.value || "");
  const expected = content.answer.expectedValue;
  const tol = content.answer.tolerance || 0;
  const numericOk =
    isA && !isNaN(userNum) && Math.abs(userNum - expected) <= tol + 0.01;

  return (
    <div>
      <h3 className="font-display font-semibold text-lg mb-4">
        <ChemText text={content.question} />
      </h3>

      {content.context && (
        <div className="p-4 rounded-2xl bg-navy-50 dark:bg-navy-900/10 border border-navy-200 dark:border-navy-800/30 mb-4">
          <p className="text-sm whitespace-pre-line">
            <ChemText text={content.context} />
          </p>
        </div>
      )}

      {/* Dane wejściowe */}
      {content.givens?.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 mb-4">
          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
            Dane
          </p>
          <ul className="space-y-1">
            {content.givens.map((g: any, i: number) => (
              <li
                key={i}
                className="text-sm text-zinc-700 dark:text-zinc-300 flex justify-between"
              >
                <span>{g.label}:</span>
                <span className="font-mono font-semibold">{g.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.formula && (
        <div className="p-3 rounded-xl bg-zinc-100 dark:bg-surface-800 mb-4 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
            Wzór
          </p>
          <code className="text-sm font-mono">
            <Chem block>{content.formula}</Chem>
          </code>
        </div>
      )}

      {/* Tok rozumowania */}
      {content.showSteps && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5">
            Tok rozumowania / obliczenia
          </label>
          <textarea
            value={ans.steps || ""}
            onChange={(e) => set("steps", e.target.value)}
            disabled={disabled}
            rows={4}
            className="input resize-none text-sm font-mono"
            placeholder="Rozpisz obliczenia krok po kroku..."
          />
        </div>
      )}

      {/* Wynik z jednostką */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Wynik</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={ans.value || ""}
            onChange={(e) => set("value", e.target.value)}
            disabled={disabled}
            className={`input flex-1 text-lg font-mono ${isA ? (numericOk ? "!border-brand-500" : "!border-red-500") : ""}`}
            placeholder="0"
            inputMode="decimal"
          />
          <span className="text-base font-semibold text-zinc-600 dark:text-zinc-400 min-w-[60px]">
            {content.answer.unit}
          </span>
        </div>
        {isA && !numericOk && (
          <p className="text-xs mt-2 text-brand-600">
            Poprawna wartość: {expected} {content.answer.unit}
            {tol > 0 && ` (±${tol})`}
          </p>
        )}
      </div>

      <MiniFeedback feedback={feedback} />
    </div>
  );
}
