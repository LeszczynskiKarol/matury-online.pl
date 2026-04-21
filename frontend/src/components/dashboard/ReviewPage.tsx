import { useState, useEffect } from "react";
import { review as reviewApi } from "../../lib/api";

// ══════════════════════════════════════════════════════════════════════════
// HELPERS — obsługują wszystkie 19 typów pytań
// ══════════════════════════════════════════════════════════════════════════

function getQuestionPrompt(question: any): {
  heading?: string;
  body: string;
} {
  if (!question) return { body: "Brak danych pytania" };
  const c = question.content || {};
  const type = question.type;

  switch (type) {
    case "CLOZE": {
      // Instrukcja + template z widocznymi lukami
      const readable = (c.template || "").replace(/\{\{(\w+)\}\}/g, "____");
      return {
        heading: c.instruction || "Uzupełnij luki",
        body: readable || "Brak treści pytania",
      };
    }

    case "WIAZKA": {
      // Kontekst + lista pod-pytań
      const subs = (c.subQuestions || [])
        .map(
          (sq: any, i: number) =>
            `${String.fromCharCode(97 + i)}) ${sq.text || ""}`,
        )
        .join("\n");
      return {
        heading: "Praca z tekstem",
        body: `${c.context || ""}\n\n${subs}`.trim(),
      };
    }

    case "TABLE_DATA": {
      const table = c.table
        ? `[Tabela: ${c.table.headers?.join(" · ") || ""}]`
        : "";
      const subs = (c.subQuestions || [])
        .map((sq: any, i: number) => `${i + 1}. ${sq.text}`)
        .join("\n");
      return {
        heading: c.question || "Analiza danych",
        body: `${table}\n\n${subs}`.trim(),
      };
    }

    case "GRAPH_INTERPRET": {
      const subs = (c.subQuestions || [])
        .map((sq: any, i: number) => `${i + 1}. ${sq.text}`)
        .join("\n");
      return {
        heading: c.question || "Interpretacja wykresu",
        body: `[Wykres — otwórz w sesji, żeby zobaczyć]\n\n${subs}`.trim(),
      };
    }

    case "CLOSED":
    case "MULTI_SELECT": {
      const opts = (c.options || [])
        .map((o: any) => `${o.id}) ${o.text}`)
        .join("\n");
      return {
        heading: c.question || "Pytanie",
        body: opts,
      };
    }

    case "TRUE_FALSE": {
      const stmts = (c.statements || [])
        .map((s: any, i: number) => `${i + 1}. ${s.text}`)
        .join("\n");
      return {
        heading: c.question || "Oceń prawdziwość stwierdzeń",
        body: stmts,
      };
    }

    case "ORDERING": {
      const items = (c.items || [])
        .map((item: string, i: number) => `• ${item}`)
        .join("\n");
      return {
        heading: c.question || "Ustaw w poprawnej kolejności",
        body: items,
      };
    }

    case "PROOF_ORDER": {
      const steps = (c.steps || []).map((s: any) => `• ${s.text}`).join("\n");
      return {
        heading: c.question || "Ułóż kroki dowodu",
        body: steps,
      };
    }

    case "ERROR_FIND": {
      const steps = (c.steps || [])
        .map((s: any) => `${s.id}) ${s.text}`)
        .join("\n");
      return {
        heading: c.question || "Znajdź krok z błędem",
        body: steps,
      };
    }

    case "FILL_IN": {
      const blanks = (c.blanks || [])
        .map((_: any, i: number) => `${i + 1}. ____`)
        .join("\n");
      return {
        heading: c.question || "Uzupełnij luki",
        body: blanks || "Brak zdefiniowanych luk",
      };
    }

    case "MATCHING": {
      const left = (c.pairs || []).map((p: any) => `• ${p.left}`).join("\n");
      return {
        heading: c.question || "Dopasuj pary",
        body: left,
      };
    }

    case "LISTENING":
      return {
        heading: c.contextPL || "Słuchanie",
        body: "🎧 Otwórz w sesji, żeby odtworzyć nagranie i zobaczyć pytania",
      };

    case "ESSAY":
      return {
        heading: "Temat wypracowania",
        body: c.prompt || "Brak tematu",
      };

    case "OPEN":
      return {
        heading: "Pytanie otwarte",
        body: c.question || "Brak treści",
      };

    case "DIAGRAM_LABEL":
    case "EXPERIMENT_DESIGN":
    case "CROSS_PUNNETT":
    case "CALCULATION":
      return {
        heading: c.question || `Zadanie typu ${type}`,
        body: "Otwórz w sesji, by zobaczyć pełną interaktywną treść zadania",
      };

    default: {
      // Ostateczny fallback — pokaż cokolwiek sensownego
      const fallback =
        c.question ||
        c.prompt ||
        c.instruction ||
        c.context ||
        c.contextPL ||
        "";
      return {
        heading: `Pytanie typu ${type || "nieznanego"}`,
        body: fallback || "Brak treści",
      };
    }
  }
}

function getCorrectAnswerDisplay(
  question: any,
): { label: string; value: string } | null {
  if (!question) return null;
  const c = question.content || {};
  const type = question.type;

  switch (type) {
    case "CLOSED": {
      const correct = c.correctAnswer;
      const opt = c.options?.find((o: any) => o.id === correct);
      return { label: "Odpowiedź", value: `${correct} — ${opt?.text || ""}` };
    }

    case "MULTI_SELECT": {
      const correct = c.correctAnswers || [];
      const texts = correct.map((id: string) => {
        const opt = c.options?.find((o: any) => o.id === id);
        return `${id}${opt ? " — " + opt.text : ""}`;
      });
      return { label: "Poprawne odpowiedzi", value: texts.join("; ") };
    }

    case "TRUE_FALSE": {
      const stmts = (c.statements || []).map(
        (s: any, i: number) => `${i + 1}. ${s.isTrue ? "P" : "F"} — ${s.text}`,
      );
      return { label: "Poprawne oceny", value: stmts.join("\n") };
    }

    case "FILL_IN": {
      // Tu blanks to ARRAY
      const blanks = (c.blanks || []).map(
        (b: any, i: number) => `${i + 1}. ${b.acceptedAnswers?.[0] || "—"}`,
      );
      return { label: "Poprawne odpowiedzi", value: blanks.join("\n") };
    }

    case "MATCHING": {
      const pairs = (c.pairs || []).map((p: any) => `${p.left} → ${p.right}`);
      return { label: "Poprawne dopasowania", value: pairs.join("\n") };
    }

    case "ORDERING": {
      const order = c.correctOrder || [];
      const items = c.items || [];
      const ordered = order.map(
        (idx: number, i: number) => `${i + 1}. ${items[idx]}`,
      );
      return { label: "Poprawna kolejność", value: ordered.join("\n") };
    }

    case "PROOF_ORDER": {
      const order = c.correctOrder || [];
      const steps = c.steps || [];
      const ordered = order.map((id: string, i: number) => {
        const step = steps.find((s: any) => s.id === id);
        return `${i + 1}. ${step?.text || id}`;
      });
      return { label: "Poprawna kolejność dowodu", value: ordered.join("\n") };
    }

    case "ERROR_FIND": {
      const errorId = c.correctErrorStep;
      const step = (c.steps || []).find((s: any) => s.id === errorId);
      return {
        label: "Krok z błędem",
        value: `${errorId} — ${step?.text || ""}`,
      };
    }

    case "CLOZE": {
      // Blanks to OBIEKT {b1: {...}, b2: {...}}
      // Pokaż template z wstawionymi poprawnymi odpowiedziami
      const blanks = c.blanks || {};
      const template = c.template || "";
      const filled = template.replace(
        /\{\{(\w+)\}\}/g,
        (_: string, key: string) => {
          const answer = blanks[key]?.acceptedAnswers?.[0];
          return answer ? `[${answer}]` : "____";
        },
      );

      // Dodatkowo lista wszystkich akceptowanych
      const list = Object.entries(blanks)
        .map(([key, val]: [string, any]) => {
          const accepted = (val?.acceptedAnswers || []).join(" / ");
          return `${key}: ${accepted || "—"}`;
        })
        .join("\n");

      return {
        label: "Poprawne wypełnienie",
        value: `${filled}\n\nAkceptowane warianty:\n${list}`,
      };
    }

    case "OPEN":
      return c.sampleAnswer
        ? { label: "Przykładowa odpowiedź", value: c.sampleAnswer }
        : {
            label: "Kryteria oceny",
            value: c.rubric || "Pytanie oceniane przez AI",
          };

    case "ESSAY":
      return {
        label: "Kryteria oceny",
        value:
          (c.criteria || [])
            .map(
              (k: any) =>
                `• ${k.name} (${k.maxPoints} pkt): ${k.description || ""}`,
            )
            .join("\n") || "Wypracowanie oceniane przez AI",
      };

    case "LISTENING":
      return {
        label: "Typ",
        value: "Słuchanie — otwórz w sesji, żeby odtworzyć nagranie",
      };

    case "TABLE_DATA":
    case "GRAPH_INTERPRET": {
      const subs = c.subQuestions || [];
      const list = subs.map(
        (sq: any, i: number) =>
          `${i + 1}. ${sq.text} → ${sq.acceptedAnswers?.[0] || "—"}`,
      );
      return { label: "Poprawne odpowiedzi", value: list.join("\n") };
    }

    case "WIAZKA": {
      // Pokaż jakiekolwiek poprawne odpowiedzi z sub-pytań
      const subs = c.subQuestions || [];
      const answers = subs
        .map((sq: any, i: number) => {
          const letter = String.fromCharCode(97 + i);
          if (sq.correctAnswer) return `${letter}) ${sq.correctAnswer}`;
          if (sq.statements)
            return `${letter}) ${sq.statements
              .map((s: any) => (s.isTrue ? "P" : "F"))
              .join(" ")}`;
          return `${letter}) (ocena AI)`;
        })
        .join("\n");
      return { label: "Poprawne odpowiedzi", value: answers };
    }

    case "DIAGRAM_LABEL":
    case "EXPERIMENT_DESIGN":
    case "CROSS_PUNNETT":
    case "CALCULATION":
      return {
        label: "Typ zadania",
        value: "Otwórz w sesji, by zobaczyć pełną interaktywną treść",
      };

    default:
      return null;
  }
}

function formatInterval(days: number): string {
  if (days < 1) return "dziś";
  if (days === 1) return "1 dzień";
  if (days < 7) return `${days} dni`;
  if (days < 30) return `${Math.round(days / 7)} tyg.`;
  return `${Math.round(days / 30)} mies.`;
}

// ══════════════════════════════════════════════════════════════════════════
// GŁÓWNY KOMPONENT
// ══════════════════════════════════════════════════════════════════════════

export function ReviewPage() {
  const [stats, setStats] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"stats" | "review" | "done">("stats");

  useEffect(() => {
    Promise.all([reviewApi.stats(), reviewApi.due({ limit: 20 })])
      .then(([s, c]) => {
        setStats(s);
        setCards(c);
        // Debug: sprawdź co przychodzi z backendu
        if (c.length > 0) {
          console.log("[ReviewPage] First card:", c[0]);
          console.log(
            "[ReviewPage] Question content:",
            c[0]?.question?.content,
          );
        }
      })
      .catch((err) => console.error("[ReviewPage] Load error:", err))
      .finally(() => setLoading(false));
  }, []);

  const rateCard = async (quality: number) => {
    const card = cards[currentIndex];
    if (!card || submitting) return;
    setSubmitting(true);
    try {
      await reviewApi.submit({ cardId: card.cardId, quality });
    } catch (err) {
      console.error("[ReviewPage] Submit error:", err);
    } finally {
      setSubmitting(false);
    }

    if (currentIndex + 1 >= cards.length) {
      setPhase("done");
    } else {
      setCurrentIndex((i) => i + 1);
      setShowAnswer(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="max-w-md mx-auto text-center py-16 animate-scale-in">
        <div className="text-5xl mb-4">🧠</div>
        <h2 className="font-display font-bold text-2xl mb-2">
          Powtórki ukończone!
        </h2>
        <p className="text-zinc-500 mb-6">
          Przejrzano {cards.length} kart. Algorytm SM-2 zaplanował kolejne
          powtórki — wróć jutro.
        </p>
        <a href="/dashboard" className="btn-primary">
          Wróć do dashboard
        </a>
      </div>
    );
  }

  if (phase === "stats") {
    return (
      <div className="max-w-lg mx-auto space-y-8 animate-fade-in">
        <div>
          <h1 className="font-display font-bold text-2xl mb-2">
            Powtórki (Spaced Repetition)
          </h1>
          <p className="text-zinc-500">
            Algorytm SM-2 pilnuje, żebyś powtarzał materiał w idealnych
            momentach. Pytania wracają zanim zdążysz zapomnieć.
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card text-center">
              <div className="font-display font-bold text-2xl text-amber-500">
                {stats.dueCount}
              </div>
              <div className="text-xs text-zinc-500">Do powtórki</div>
            </div>
            <div className="stat-card text-center">
              <div className="font-display font-bold text-2xl">
                {stats.totalCards}
              </div>
              <div className="text-xs text-zinc-500">Łącznie kart</div>
            </div>
            <div className="stat-card text-center">
              <div className="font-display font-bold text-2xl text-brand-500">
                {stats.masteredCount}
              </div>
              <div className="text-xs text-zinc-500">Opanowane</div>
            </div>
          </div>
        )}

        {cards.length > 0 ? (
          <button
            onClick={() => setPhase("review")}
            className="btn-primary w-full py-4"
          >
            Rozpocznij powtórkę ({cards.length} kart)
          </button>
        ) : (
          <div className="glass-card p-8 text-center">
            <p className="text-zinc-500 mb-4">
              Brak kart do powtórki. Rozwiąż kilka pytań, aby wygenerować karty.
            </p>
            <a href="/dashboard/sesja" className="btn-secondary inline-flex">
              Nowa sesja
            </a>
          </div>
        )}
      </div>
    );
  }

  // ── Review phase ────────────────────────────────────────────────────────
  const card = cards[currentIndex];
  const question = card?.question;
  const promptData = getQuestionPrompt(question);
  const answerBlock = getCorrectAnswerDisplay(question);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">
          Karta {currentIndex + 1} z {cards.length}
        </span>
        <span className="text-xs text-zinc-400">
          Interwał: {formatInterval(card.interval)} · EF: {card.easeFactor}
        </span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${(currentIndex / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div
        className="glass-card p-8 min-h-[240px] flex flex-col animate-slide-up"
        key={card.cardId}
      >
        {/* Meta row */}
        <div className="flex items-center gap-2 mb-4">
          {question?.topic?.name && (
            <span className="text-xs font-medium text-zinc-500 bg-zinc-100 dark:bg-surface-800 px-3 py-1 rounded-full">
              {question.topic.name}
            </span>
          )}
          {question?.type && (
            <span className="text-[10px] uppercase tracking-wide text-zinc-400">
              {question.type}
            </span>
          )}
          {question?.difficulty !== undefined && (
            <span className="text-[10px] text-zinc-400 ml-auto">
              Trudność: {question.difficulty}/5
            </span>
          )}
        </div>

        {/* Prompt */}
        <div className="mb-4">
          {promptData.heading && (
            <h3 className="font-display font-semibold text-lg leading-relaxed mb-3">
              {promptData.heading}
            </h3>
          )}
          <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-mono bg-zinc-50 dark:bg-surface-800 p-4 rounded-xl">
            {promptData.body}
          </div>
        </div>

        {/* Toggle odpowiedzi */}
        {!showAnswer ? (
          <button
            onClick={() => setShowAnswer(true)}
            className="btn-secondary mt-auto self-center px-8 py-3"
          >
            Pokaż odpowiedź
          </button>
        ) : (
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 animate-slide-up">
            {answerBlock ? (
              <>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  {answerBlock.label}
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {answerBlock.value}
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500 italic">
                Brak zapisanej poprawnej odpowiedzi dla tego pytania — oceń z
                pamięci jak dobrze je znałeś.
              </p>
            )}

            {question?.explanation && (
              <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  Wyjaśnienie
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                  {question.explanation}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Oceny SM-2 */}
      {showAnswer && (
        <div className="animate-slide-up">
          <p className="text-xs text-zinc-500 text-center mb-3">
            Jak dobrze pamiętałeś? (wpłynie na kiedy pytanie wróci)
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[
              {
                q: 0,
                label: "Nie pamiętam",
                sub: "zresetuj",
                color: "bg-red-500",
              },
              {
                q: 2,
                label: "Trudno",
                sub: "za 1 dzień",
                color: "bg-orange-500",
              },
              {
                q: 3,
                label: "Dobrze",
                sub: "normalnie",
                color: "bg-amber-500",
              },
              {
                q: 5,
                label: "Idealnie",
                sub: "dłuższa przerwa",
                color: "bg-brand-500",
              },
            ].map((opt) => (
              <button
                key={opt.q}
                onClick={() => rateCard(opt.q)}
                disabled={submitting}
                className={`${opt.color} text-white py-3 px-2 rounded-2xl text-xs font-semibold hover:opacity-90 transition disabled:opacity-50`}
              >
                <div>{opt.label}</div>
                <div className="text-[9px] font-normal opacity-80 mt-0.5">
                  {opt.sub}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
