// ============================================================================
// AI Grading Service — Claude Sonnet 4.6 via Anthropic API
// Handles: OPEN questions, ESSAY grading, per-subject prompt strategies
// ============================================================================

import { claudeCall } from "./claude-monitor.js";

// ── Subject-specific system prompts ────────────────────────────────────────

const SUBJECT_SYSTEM_PROMPTS: Record<string, string> = {
  polski: `Jesteś doświadczonym egzaminatorem matury z języka polskiego. 
Oceniasz odpowiedzi zgodnie z kryteriami CKE. Bądź szczegółowy, ale sprawiedliwy.
Zawsze wskaż mocne strony i konkretne elementy do poprawy.
Odpowiadaj WYŁĄCZNIE po polsku.`,

  matematyka: `Jesteś egzaminatorem matury z matematyki.
Oceniaj rozwiązania krok po kroku. Sprawdzaj poprawność obliczeń, zastosowanie wzorów, logikę rozumowania.
Przyznaj punkty cząstkowe za poprawne etapy nawet jeśli wynik końcowy jest błędny.
Wskaż dokładnie gdzie nastąpił błąd. Odpowiadaj po polsku.`,

  biologia: `Jesteś egzaminatorem matury z biologii.
Oceniaj merytorycznie — terminologia, kompletność odpowiedzi, powiązania przyczynowo-skutkowe.
Odpowiadaj po polsku.`,

  chemia: `Jesteś egzaminatorem matury z chemii.
Sprawdzaj poprawność reakcji chemicznych, obliczeń stechiometrycznych, nomenklatury.
Przyznaj punkty cząstkowe. Odpowiadaj po polsku.`,

  historia: `Jesteś egzaminatorem matury z historii.
Oceniaj znajomość faktów, umiejętność analizy źródeł, argumentację.
Odpowiadaj po polsku.`,

  // Default fallback
  _default: `Jesteś doświadczonym egzaminatorem maturalnym. 
Oceniaj odpowiedzi merytorycznie, szczegółowo i sprawiedliwie. 
Zawsze wskaż mocne strony i elementy do poprawy. Odpowiadaj po polsku.`,
};

// ── Essay grading criteria per subject ─────────────────────────────────────

interface CriterionResult {
  name: string;
  score: number;
  maxScore: number;
  feedback: string;
}

interface EssayGradeResult {
  criteria: CriterionResult[];
  overallScore: number;
  overallFeedback: string;
  strengths: string[];
  improvements: string[];
}

const ESSAY_CRITERIA: Record<
  string,
  { name: string; maxScore: number; description: string }[]
> = {
  polski: [
    {
      name: "Realizacja tematu",
      maxScore: 2,
      description: "Czy praca odpowiada na postawione pytanie/temat?",
    },
    {
      name: "Teza i argumentacja",
      maxScore: 12,
      description:
        "Klarowność tezy, jakość i ilość argumentów, odwołania do tekstów",
    },
    {
      name: "Kompozycja",
      maxScore: 8,
      description: "Logiczna struktura, spójność, proporcje części",
    },
    {
      name: "Styl",
      maxScore: 4,
      description: "Stosowność stylu, bogactwo słownictwa, precyzja wyrażeń",
    },
    {
      name: "Język",
      maxScore: 8,
      description: "Poprawność gramatyczna, ortograficzna, interpunkcyjna",
    },
    { name: "Zapis", maxScore: 2, description: "Czytelność, estetyka zapisu" },
  ],
  matematyka: [
    {
      name: "Strategia rozwiązania",
      maxScore: 2,
      description: "Wybór właściwej metody",
    },
    {
      name: "Poprawność obliczeń",
      maxScore: 3,
      description: "Bezbłędność rachunków",
    },
    {
      name: "Uzasadnienie",
      maxScore: 3,
      description: "Logiczne uzasadnienie kroków",
    },
    {
      name: "Wynik końcowy",
      maxScore: 2,
      description: "Poprawność i forma wyniku",
    },
  ],
  _default: [
    {
      name: "Merytoryka",
      maxScore: 10,
      description: "Poprawność merytoryczna odpowiedzi",
    },
    {
      name: "Argumentacja",
      maxScore: 5,
      description: "Jakość argumentów i przykładów",
    },
    {
      name: "Język i styl",
      maxScore: 3,
      description: "Poprawność językowa i stylistyczna",
    },
    {
      name: "Kompletność",
      maxScore: 2,
      description: "Wyczerpujące omówienie tematu",
    },
  ],
};

// ── Grade an open question ─────────────────────────────────────────────────

export interface OpenGradeResult {
  isCorrect: boolean;
  score: number; // 0.0 - 1.0
  feedback: string;
  correctAnswer?: string;
}

export async function gradeOpenQuestion(params: {
  subjectSlug: string;
  question: string;
  rubric: string;
  maxPoints: number;
  userAnswer: string;
  sampleAnswer?: string;
}): Promise<OpenGradeResult> {
  const systemPrompt =
    SUBJECT_SYSTEM_PROMPTS[params.subjectSlug] ||
    SUBJECT_SYSTEM_PROMPTS._default;

  const userPrompt = `## Pytanie
${params.question}

## Kryteria oceny (rubric)
${params.rubric}

${params.sampleAnswer ? `## Wzorcowa odpowiedź\n${params.sampleAnswer}\n` : ""}

## Maksymalna liczba punktów: ${params.maxPoints}

## Odpowiedź ucznia
${params.userAnswer}

---

Oceń odpowiedź ucznia. Odpowiedz WYŁĄCZNIE w formacie JSON (bez markdown):
{
  "pointsAwarded": <number 0-${params.maxPoints}>,
  "isCorrect": <boolean — true jeśli >= 50% punktów>,
  "feedback": "<szczegółowy feedback po polsku, 2-4 zdania>",
  "correctAnswer": "<krótka wzorcowa odpowiedź jeśli uczeń odpowiedział źle, inaczej null>"
}`;

  const result = await claudeCall({
    caller: "ai-grading-open",
    model: "claude-sonnet-4-6",
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    metadata: { subjectSlug: params.subjectSlug, maxPoints: params.maxPoints },
  });
  const text = result.text;

  try {
    const result = JSON.parse(text);
    return {
      isCorrect: result.isCorrect ?? false,
      score: (result.pointsAwarded ?? 0) / params.maxPoints,
      feedback: result.feedback ?? "Brak szczegółowej oceny.",
      correctAnswer: result.correctAnswer ?? undefined,
    };
  } catch {
    return {
      isCorrect: false,
      score: 0,
      feedback: "Wystąpił błąd podczas oceny. Spróbuj ponownie.",
    };
  }
}

// ── Grade an essay ─────────────────────────────────────────────────────────

export async function gradeEssay(params: {
  subjectSlug: string;
  prompt: string;
  content: string;
}): Promise<EssayGradeResult> {
  const systemPrompt =
    SUBJECT_SYSTEM_PROMPTS[params.subjectSlug] ||
    SUBJECT_SYSTEM_PROMPTS._default;
  const criteria =
    ESSAY_CRITERIA[params.subjectSlug] || ESSAY_CRITERIA._default;
  const maxTotal = criteria.reduce((sum, c) => sum + c.maxScore, 0);

  const criteriaDesc = criteria
    .map((c) => `- ${c.name} (max ${c.maxScore} pkt): ${c.description}`)
    .join("\n");

  const userPrompt = `## Temat wypracowania
${params.prompt}

## Kryteria oceny
${criteriaDesc}

## Maksymalna suma punktów: ${maxTotal}

## Treść wypracowania ucznia
${params.content}

---

Oceń wypracowanie. Odpowiedz WYŁĄCZNIE w formacie JSON (bez markdown):
{
  "criteria": [
    ${criteria.map((c) => `{ "name": "${c.name}", "score": <0-${c.maxScore}>, "maxScore": ${c.maxScore}, "feedback": "<1-2 zdania>" }`).join(",\n    ")}
  ],
  "overallFeedback": "<ogólna ocena, 3-5 zdań>",
  "strengths": ["<mocna strona 1>", "<mocna strona 2>"],
  "improvements": ["<do poprawy 1>", "<do poprawy 2>"]
}`;

  const result = await claudeCall({
    caller: "ai-grading-essay",
    model: "claude-sonnet-4-6",
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    metadata: { subjectSlug: params.subjectSlug },
  });
  const text = result.text;

  try {
    const result = JSON.parse(text);
    const totalScore = (result.criteria as CriterionResult[]).reduce(
      (s, c) => s + c.score,
      0,
    );

    return {
      criteria: result.criteria,
      overallScore: (totalScore / maxTotal) * 100,
      overallFeedback: result.overallFeedback,
      strengths: result.strengths || [],
      improvements: result.improvements || [],
    };
  } catch {
    return {
      criteria: criteria.map((c) => ({
        name: c.name,
        score: 0,
        maxScore: c.maxScore,
        feedback: "Błąd oceny",
      })),
      overallScore: 0,
      overallFeedback:
        "Wystąpił błąd podczas oceny wypracowania. Spróbuj ponownie.",
      strengths: [],
      improvements: [],
    };
  }
}
