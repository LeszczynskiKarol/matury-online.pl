// ============================================================================
// Explanation Generator Service
// backend/src/services/explanation-generator.ts
//
// Generates missing explanations for questions using Claude API.
// Uses claudeCall() for full logging + cost tracking.
// ============================================================================

import { PrismaClient, QuestionType } from "@prisma/client";
import { claudeCall } from "./claude-monitor.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExplanationResult {
  questionId: string;
  explanation: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  logId: string;
  success: boolean;
  error?: string;
}

export interface BatchProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  results: ExplanationResult[];
}

export interface MissingExplanationStats {
  total: number;
  bySubject: { slug: string; name: string; count: number }[];
  byType: { type: string; count: number }[];
  byTopic: { topicId: string; topicName: string; count: number }[];
}

// ── System prompt — per question type ─────────────────────────────────────────

const BASE_RULES = `Odpowiadaj WYŁĄCZNIE po polsku.
NIE używaj formatowania markdown (##, **, itp.) — pisz czystym tekstem.
Nie zaczynaj od "Wyjaśnienie:" ani podobnych nagłówków — od razu treść.
Jeśli pytanie dotyczy lektury lub epoki — wpleć krótki kontekst literacki.`;

const TYPE_PROMPTS: Record<string, string> = {
  // ── Proste — 2-3 zdania, konkret, zero porad egzaminacyjnych ──────
  CLOSED: `Jesteś nauczycielem. Piszesz KRÓTKIE wyjaśnienie do pytania zamkniętego (ABCD).

ZASADY:
- Napisz 2-3 zdania: dlaczego poprawna odpowiedź jest poprawna + czemu najczęściej mylona opcja jest błędna.
- NIE wyjaśniaj każdej błędnej opcji osobno — tylko tę najbardziej mylącą.
- NIE dawaj porad egzaminacyjnych, tipów, ani wskazówek "jak rozwiązywać".
- Bądź konkretny i zwięzły.
${BASE_RULES}`,

  MULTI_SELECT: `Jesteś nauczycielem. Piszesz KRÓTKIE wyjaśnienie do pytania wielokrotnego wyboru.

ZASADY:
- Napisz 2-4 zdania: wyjaśnij wspólną cechę poprawnych odpowiedzi i dlaczego pozostałe jej nie spełniają.
- NIE omawiaj każdej opcji osobno — grupuj logicznie.
- NIE dawaj porad egzaminacyjnych.
- Bądź konkretny i zwięzły.
${BASE_RULES}`,

  TRUE_FALSE: `Jesteś nauczycielem. Piszesz KRÓTKIE wyjaśnienie do pytania prawda/fałsz.

ZASADY:
- Jedno zdanie na każde stwierdzenie: fakt lub korekta.
- NIE dawaj porad egzaminacyjnych.
- Bądź konkretny i zwięzły.
${BASE_RULES}`,

  ERROR_FIND: `Jesteś nauczycielem. Piszesz KRÓTKIE wyjaśnienie do pytania "znajdź błąd".

ZASADY:
- Wskaż błąd, podaj poprawną formę i krótko wyjaśnij zasadę (1-2 zdania).
- NIE dawaj porad egzaminacyjnych.
${BASE_RULES}`,

  // ── Średnie — 3-4 zdania ──────────────────────────────────────────
  FILL_IN: `Jesteś nauczycielem. Piszesz wyjaśnienie do pytania z wpisywaniem odpowiedzi.

ZASADY:
- Dla każdej luki: podaj poprawną odpowiedź i 1 zdanie dlaczego.
- Jeśli luk jest dużo (>4), grupuj je tematycznie.
- Długość: 3-4 zdania łącznie.
${BASE_RULES}`,

  CLOZE: `Jesteś nauczycielem. Piszesz wyjaśnienie do pytania typu cloze (uzupełnianie luk).

ZASADY:
- Dla każdej luki: podaj poprawną odpowiedź i krótkie uzasadnienie.
- Jeśli luki dotyczą jednego tekstu/kontekstu — zacznij od 1 zdania kontekstu.
- Długość: 3-5 zdań.
${BASE_RULES}`,

  MATCHING: `Jesteś nauczycielem. Piszesz wyjaśnienie do pytania z dopasowywaniem.

ZASADY:
- Wyjaśnij logikę dopasowania — wspólną zasadę łączącą pary.
- Nie omawiaj każdej pary osobno, chyba że jest ich mało (≤4).
- Długość: 3-4 zdania.
${BASE_RULES}`,

  ORDERING: `Jesteś nauczycielem. Piszesz wyjaśnienie do pytania z porządkowaniem.

ZASADY:
- Wyjaśnij zasadę kolejności (chronologia, logika, przyczynowość).
- Nie opisuj każdego elementu osobno — wyjaśnij logikę.
- Długość: 2-3 zdania.
${BASE_RULES}`,

  WIAZKA: `Jesteś nauczycielem. Piszesz wyjaśnienie do pytania wiązkowego (tekst + podpytania).

ZASADY:
- Zacznij od 1 zdania o kontekście/tekście źródłowym.
- Dla każdego podpytania: 1-2 zdania z uzasadnieniem.
- Łącznie nie więcej niż 6-8 zdań.
${BASE_RULES}`,

  // ── Rozbudowane — pełniejsze wyjaśnienie ──────────────────────────
  OPEN: `Jesteś doświadczonym egzaminatorem maturalnym. Piszesz wyjaśnienie do pytania otwartego.

ZASADY:
- Podaj kluczowe elementy wzorcowej odpowiedzi (co MUSI się pojawić żeby dostać pełne punkty).
- Jeśli pytanie dotyczy lektury — podaj konkretne odwołania (sceny, cytaty, postacie).
- Na końcu możesz dodać 1 zdanie ze wskazówką egzaminacyjną.
- Długość: 4-6 zdań.
${BASE_RULES}`,

  ESSAY: `Jesteś doświadczonym egzaminatorem maturalnym. Piszesz wyjaśnienie do tematu wypracowania.

ZASADY:
- Zasugeruj tezę i 2-3 możliwe argumenty z konkretnymi lekturami/przykładami.
- Wskaż czego unikać (najczęstsze błędy w tym typie tematu).
- Na końcu dodaj 1-2 zdania wskazówek kompozycyjnych.
- Długość: 5-8 zdań.
${BASE_RULES}`,
};

function getSystemPrompt(type: QuestionType): string {
  return (
    TYPE_PROMPTS[type] ||
    `Jesteś nauczycielem. Piszesz wyjaśnienie do pytania maturalnego.

ZASADY:
- Wyjaśnij poprawną odpowiedź i dlaczego jest poprawna.
- Bądź konkretny, 3-5 zdań.
${BASE_RULES}`
  );
}

function getMaxTokens(type: QuestionType): number {
  switch (type) {
    case "CLOSED":
    case "TRUE_FALSE":
    case "ERROR_FIND":
      return 400;
    case "MULTI_SELECT":
    case "FILL_IN":
    case "ORDERING":
    case "MATCHING":
    case "CLOZE":
      return 600;
    case "WIAZKA":
    case "OPEN":
      return 800;
    case "ESSAY":
      return 1024;
    default:
      return 600;
  }
}

// ── Build prompt per question type ───────────────────────────────────────────

function buildPrompt(question: {
  type: QuestionType;
  content: any;
  topic: { name: string; parent?: { name: string } | null };
}): string {
  const c = question.content as any;
  const topicCtx = question.topic.parent
    ? `Dział: ${question.topic.parent.name} → ${question.topic.name}`
    : `Dział: ${question.topic.name}`;

  // Shared metadata — context, work, epoch, word, words, etc.
  const meta = [
    c.context ? `Kontekst/tekst źródłowy: ${c.context}` : "",
    c.passage ? `Tekst źródłowy: ${c.passage}` : "",
    c.word ? `Dotyczy wyrazu/frazy: "${c.word}"` : "",
    c.words?.length ? `Wyrazy do użycia: ${c.words.join(", ")}` : "",
    c.epochLabel ? `Epoka: ${c.epochLabel}` : "",
    c.work ? `Lektura: ${c.work}` : "",
    c.instruction ? `Instrukcja: ${c.instruction}` : "",
    c.template && !["CLOZE"].includes(question.type)
      ? `Szablon: ${c.template}`
      : "",
    c.requirements?.length ? `Wymagania: ${c.requirements.join("; ")}` : "",
    c.thesis ? `Teza: ${c.thesis}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  switch (question.type) {
    case "CLOSED":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie (CLOSED — jednokrotny wybór):
${c.question}

Opcje:
${(c.options || []).map((o: any) => `${o.id}. ${o.text}`).join("\n")}

Prawidłowa odpowiedź: ${c.correctAnswer}

Napisz wyjaśnienie: dlaczego odpowiedź ${c.correctAnswer} jest poprawna, a pozostałe nie.`;

    case "MULTI_SELECT":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie (MULTI_SELECT — wielokrotny wybór):
${c.question}

Opcje:
${(c.options || []).map((o: any) => `${o.id}. ${o.text}`).join("\n")}

Prawidłowe odpowiedzi: ${(c.correctAnswers || []).join(", ")}

Napisz wyjaśnienie: dlaczego te odpowiedzi są poprawne, a pozostałe nie.`;

    case "OPEN":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie (OPEN — otwarte):
${c.question}

Kryteria oceny: ${c.rubric || "(brak)"}
Maks. punktów: ${c.maxPoints || "?"}
${c.sampleAnswer ? `Wzorcowa odpowiedź: ${c.sampleAnswer}` : ""}

Napisz wyjaśnienie: kluczowe elementy poprawnej odpowiedzi i wskazówki dla ucznia.`;

    case "ESSAY":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Temat wypracowania (ESSAY):
${c.prompt || c.question}

Kryteria:
${(c.criteria || []).map((cr: any) => `- ${cr.name} (maks. ${cr.maxPoints} pkt): ${cr.description || ""}`).join("\n")}

Napisz wyjaśnienie: jak podejść do tego tematu, jaką tezę postawić, jakie argumenty/lektury przywołać.`;

    case "CLOZE": {
      // Handle both array and object blanks
      const blanksStr = Array.isArray(c.blanks)
        ? (c.blanks || [])
            .map(
              (b: any, i: number) =>
                `Luka ${i + 1}: ${(b.acceptedAnswers || []).join(" / ")}`,
            )
            .join("\n")
        : Object.entries(c.blanks || {})
            .map(
              ([key, b]: [string, any]) =>
                `${key}: ${(b.acceptedAnswers || []).join(" / ")}`,
            )
            .join("\n");
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie (CLOZE — uzupełnianie luk):
${c.template || c.question || c.text}

Luki i poprawne odpowiedzi:
${blanksStr}

Napisz wyjaśnienie: dlaczego te słowa/frazy są poprawne w każdej luce.`;
    }

    case "WIAZKA":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie wiązkowe (WIĄZKA — tekst + kilka podpytań):
Kontekst/tekst: ${c.context || c.passage || c.question || "(brak)"}

Podpytania:
${(c.subQuestions || c.questions || [])
  .map((sq: any, i: number) => {
    const opts = (sq.options || [])
      .map((o: any) => `  ${o.id}. ${o.text}`)
      .join("\n");
    return `${i + 1}. ${sq.question || sq.text}\n${opts}\n   Poprawna: ${sq.correctAnswer || (sq.correctAnswers || []).join(", ")}`;
  })
  .join("\n\n")}

Napisz wyjaśnienie do całej wiązki: kontekst tekstu i dlaczego każda odpowiedź jest poprawna.`;

    case "MATCHING":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie (MATCHING — dopasowywanie):
${c.question}

Poprawne pary:
${(c.pairs || []).map((p: any) => `${p.left} → ${p.right}`).join("\n")}

Napisz wyjaśnienie: dlaczego te pary są poprawnie dopasowane.`;

    case "TRUE_FALSE":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie (TRUE_FALSE — prawda/fałsz):
${c.question}

Stwierdzenia:
${(c.statements || []).map((s: any, i: number) => `${i + 1}. ${s.text} → ${s.isTrue ? "PRAWDA" : "FAŁSZ"}`).join("\n")}

Napisz wyjaśnienie: krótko uzasadnij każde stwierdzenie.`;

    case "FILL_IN":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie (FILL_IN — wpisywanie):
${c.question}

Poprawne odpowiedzi:
${(c.blanks || []).map((b: any, i: number) => `Pole ${i + 1}: ${(b.acceptedAnswers || []).join(" / ")}`).join("\n")}

Napisz wyjaśnienie: dlaczego te odpowiedzi są poprawne.`;

    case "ORDERING":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie (ORDERING — porządkowanie):
${c.question}

Elementy: ${(c.items || []).join(", ")}
Poprawna kolejność: ${(c.correctOrder || []).map((i: number) => c.items?.[i] || i).join(" → ")}

Napisz wyjaśnienie: dlaczego ta kolejność jest prawidłowa.`;

    case "ERROR_FIND":
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Pytanie (ERROR_FIND — znajdź błąd):
${c.question || c.text}

${c.correctAnswer ? `Prawidłowa odpowiedź: ${c.correctAnswer}` : ""}
${c.errors ? `Błędy: ${JSON.stringify(c.errors)}` : ""}

Napisz wyjaśnienie: jakie błędy występują i jak je poprawić.`;

    default:
      return `${topicCtx}
${meta ? `\n${meta}\n` : ""}
Typ pytania: ${question.type}
Treść: ${JSON.stringify(c).slice(0, 2000)}

Napisz wyjaśnienie do tego pytania: co jest prawidłową odpowiedzią i dlaczego.`;
  }
}

// ── Get missing explanation stats ────────────────────────────────────────────

export async function getMissingExplanationStats(
  prisma: PrismaClient,
  subjectId?: string,
): Promise<MissingExplanationStats> {
  const baseWhere: any = {
    isActive: true,
    OR: [{ explanation: null }, { explanation: "" }],
  };
  if (subjectId) baseWhere.subjectId = subjectId;

  const total = await prisma.question.count({ where: baseWhere });

  const bySubjectRaw = await prisma.question.groupBy({
    by: ["subjectId"],
    where: baseWhere,
    _count: { id: true },
  });
  const subjectIds = bySubjectRaw.map((r) => r.subjectId);
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, slug: true, name: true },
  });
  const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]));
  const bySubject = bySubjectRaw
    .map((r) => ({
      slug: subjectMap[r.subjectId]?.slug || "",
      name: subjectMap[r.subjectId]?.name || "",
      count: r._count.id,
    }))
    .sort((a, b) => b.count - a.count);

  const byTypeRaw = await prisma.question.groupBy({
    by: ["type"],
    where: baseWhere,
    _count: { id: true },
  });
  const byType = byTypeRaw
    .map((r) => ({ type: r.type, count: r._count.id }))
    .sort((a, b) => b.count - a.count);

  const byTopicRaw = await prisma.question.groupBy({
    by: ["topicId"],
    where: baseWhere,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 30,
  });
  const topicIds = byTopicRaw.map((r) => r.topicId);
  const topics = await prisma.topic.findMany({
    where: { id: { in: topicIds } },
    select: { id: true, name: true },
  });
  const topicMap = Object.fromEntries(topics.map((t) => [t.id, t.name]));
  const byTopic = byTopicRaw.map((r) => ({
    topicId: r.topicId,
    topicName: topicMap[r.topicId] || "",
    count: r._count.id,
  }));

  return { total, bySubject, byType, byTopic };
}

// ── Get questions missing explanation ────────────────────────────────────────

export async function getQuestionsMissingExplanation(
  prisma: PrismaClient,
  opts: {
    subjectId?: string;
    topicId?: string;
    type?: string;
    limit?: number;
    offset?: number;
  },
) {
  const where: any = {
    isActive: true,
    OR: [{ explanation: null }, { explanation: "" }],
  };
  if (opts.subjectId) where.subjectId = opts.subjectId;
  if (opts.topicId) where.topicId = opts.topicId;
  if (opts.type) where.type = opts.type;

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: opts.limit || 20,
      skip: opts.offset || 0,
      select: {
        id: true,
        type: true,
        difficulty: true,
        content: true,
        explanation: true,
        source: true,
        createdAt: true,
        topic: {
          select: {
            id: true,
            name: true,
            slug: true,
            parent: { select: { name: true } },
          },
        },
        subject: { select: { id: true, slug: true, name: true } },
      },
    }),
    prisma.question.count({ where }),
  ]);

  return { questions, total };
}

// ── Generate explanation for single question ─────────────────────────────────

export async function generateExplanation(
  prisma: PrismaClient,
  questionId: string,
  opts?: { model?: string; dryRun?: boolean },
): Promise<ExplanationResult> {
  const model = opts?.model || "claude-sonnet-4-6";

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      type: true,
      content: true,
      explanation: true,
      topic: {
        select: {
          name: true,
          parent: { select: { name: true } },
        },
      },
      subject: { select: { slug: true } },
    },
  });

  if (!question) {
    return {
      questionId,
      explanation: "",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      logId: "",
      success: false,
      error: "Question not found",
    };
  }

  const prompt = buildPrompt({
    type: question.type as QuestionType,
    content: question.content,
    topic: question.topic,
  });

  if (opts?.dryRun) {
    return {
      questionId,
      explanation: `[DRY RUN] Prompt length: ${prompt.length} chars`,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      logId: "dry-run",
      success: true,
    };
  }

  try {
    const result = await claudeCall({
      caller: "explanation-generator",
      model,
      maxTokens: getMaxTokens(question.type as QuestionType),
      system: getSystemPrompt(question.type as QuestionType),
      messages: [{ role: "user", content: prompt }],
      questionId,
      metadata: {
        questionType: question.type,
        subjectSlug: question.subject.slug,
        topicName: question.topic.name,
      },
    });

    // Clean up response — strip any leftover markdown
    let explanation = result.text.trim();
    explanation = explanation
      .replace(/^(Wyjaśnienie|Explanation|Odpowiedź)[:：]\s*/i, "")
      .trim();

    // Save to DB
    await prisma.question.update({
      where: { id: questionId },
      data: { explanation },
    });

    return {
      questionId,
      explanation,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      logId: result.logId,
      success: true,
    };
  } catch (e: any) {
    return {
      questionId,
      explanation: "",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      logId: "",
      success: false,
      error: e.message,
    };
  }
}

// ── Batch generate — processes sequentially to avoid rate limits ──────────────

export async function generateExplanationsBatch(
  prisma: PrismaClient,
  questionIds: string[],
  opts?: {
    model?: string;
    delayMs?: number;
    onProgress?: (progress: BatchProgress) => void;
  },
): Promise<BatchProgress> {
  const model = opts?.model || "claude-sonnet-4-6";
  const delayMs = opts?.delayMs ?? 500; // 500ms between calls to be safe

  const progress: BatchProgress = {
    total: questionIds.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    results: [],
  };

  for (const qId of questionIds) {
    const result = await generateExplanation(prisma, qId, { model });

    progress.processed++;
    if (result.success) {
      progress.succeeded++;
    } else {
      progress.failed++;
    }
    progress.totalCostUsd += result.costUsd;
    progress.totalInputTokens += result.inputTokens;
    progress.totalOutputTokens += result.outputTokens;
    progress.results.push(result);

    opts?.onProgress?.(progress);

    // Delay between calls
    if (delayMs > 0 && progress.processed < progress.total) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return progress;
}
