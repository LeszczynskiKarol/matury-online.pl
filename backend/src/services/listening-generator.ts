// ============================================================================
// Listening Content Generator — Claude Sonnet generates transcripts + questions
// backend/src/services/listening-generator.ts
//
// Supports: English (angielski) + German (niemiecki)
//
// Flow:  generate() → Claude API → content JSON → DB → TTS → S3 → done
//
// Usage:
//   import { generateListeningQuestion } from './services/listening-generator.js';
//   const questionId = await generateListeningQuestion(prisma, { ... });
//
// CLI:
//   npx tsx src/jobs/generate-listening-batch.ts --count=10 --level=PP
// ============================================================================

import { claudeCall } from "./claude-monitor.js";
import { PrismaClient } from "@prisma/client";
import { VOICES, VoiceName, generateListeningAudio } from "./tts.service.js";

// ── Listening Task Patterns (mirror CKE matura format) ───────────────────

export type ListeningPattern =
  | "short_dialogue"
  | "monologue_tf"
  | "interview_mcq"
  | "gap_fill"
  | "extended_mixed";

export type Level = "PP" | "PR";
export type Language = "en" | "de";

interface GenerateParams {
  subjectId: string;
  topicId: string;
  pattern: ListeningPattern;
  level: Level;
  topic?: string;
  difficulty?: number;
  language?: Language;
}

// ── Voice Assignment Logic ───────────────────────────────────────────────

interface VoiceAssignment {
  speaker: string;
  voice: VoiceName;
}

function assignVoices(
  pattern: ListeningPattern,
  speakerCount: number,
  language: Language = "en",
): VoiceAssignment[] {
  const pool: VoiceAssignment[] =
    language === "de"
      ? [
          { speaker: "Speaker 1", voice: VOICES.GERMAN_FEMALE },
          { speaker: "Speaker 2", voice: VOICES.GERMAN_MALE },
          { speaker: "Speaker 3", voice: VOICES.GERMAN_FEMALE_2 },
          { speaker: "Speaker 4", voice: VOICES.GERMAN_MALE_2 },
        ]
      : [
          { speaker: "Speaker 1", voice: VOICES.BRITISH_FEMALE },
          { speaker: "Speaker 2", voice: VOICES.BRITISH_MALE },
          { speaker: "Speaker 3", voice: VOICES.BRITISH_FEMALE_2 },
          { speaker: "Speaker 4", voice: VOICES.BRITISH_MALE_2 },
        ];

  if (pattern === "monologue_tf" || pattern === "gap_fill") {
    return [pool[Math.random() > 0.5 ? 0 : 1]];
  }

  return pool.slice(0, Math.min(speakerCount, 4));
}

// ── Prompt Builder ───────────────────────────────────────────────────────

function buildPrompt(params: GenerateParams): string {
  const lang: Language = params.language || "en";
  const isDE = lang === "de";

  const levelDesc = isDE
    ? params.level === "PP"
      ? "B1/B1+ (matura podstawowa). Einfache, klare Sprache. Moderates Tempo. Alltagssituationen."
      : "B2/C1 (matura rozszerzona). Komplexer Wortschatz, differenzierte Argumente. Natürliches Tempo."
    : params.level === "PP"
      ? "B1/B1+ (matura podstawowa). Simple, clear language. Speed: moderate."
      : "B2/C1 (matura rozszerzona). Complex vocabulary, nuanced arguments. Natural speed.";

  const topicHint = params.topic
    ? isDE
      ? `Thema: ${params.topic}.`
      : `Topic/theme: ${params.topic}.`
    : isDE
      ? "Wähle ein interessantes, abwechslungsreiches Thema, das für 18-jährige polnische Abiturienten geeignet ist."
      : "Choose an interesting, varied topic appropriate for 18-year-old Polish students preparing for matura.";

  const patternInstructions: Record<ListeningPattern, string> = isDE
    ? {
        short_dialogue: `Create a SHORT DIALOGUE IN GERMAN (4-8 exchanges, 30-60 seconds when read aloud).
Two speakers in a natural, everyday situation (Geschäft, Schule, Reise, Telefonat, Arztpraxis, Restaurant, Bahnhof, etc.).
Generate 3 subQuestions using a MIX of types:
- 1 CLOSED (multiple choice A-D) testing a specific detail
- 1 TRUE_FALSE (with 2 statements) testing comprehension
- 1 FILL_IN (student writes a word or short phrase heard in the recording)
All questions IN GERMAN. This creates a rich exercise worth 4 points total.`,

        monologue_tf: `Create a MONOLOGUE IN GERMAN (1-2 minutes when read aloud, ~150-250 words).
One speaker: could be a Reiseführer, Lehrer, Radiosprecher, student giving a Referat, Museumsmitarbeiter, etc.
Generate 3-4 subQuestions using a MIX of types:
- 1 CLOSED (multiple choice A-D)
- 1 TRUE_FALSE (with 3-4 statements testing detailed comprehension, at least one tricky paraphrase, at least one plausible-sounding but false detail)
- 1 FILL_IN (specific detail: word, number, or short phrase)
All questions IN GERMAN. This creates a rich exercise worth 4-5 points total.`,

        interview_mcq: `Create an INTERVIEW or CONVERSATION IN GERMAN (2-3 minutes, ~250-400 words).
Two speakers: an interviewer and a guest (Experte/Expertin, Reisende/r, Künstler/in, Sportler/in, Wissenschaftler/in, etc.).
Generate 3-4 subQuestions using a MIX of types:
- 1-2 CLOSED (multiple choice A-D, distribute correct answers across letters)
- 1 TRUE_FALSE (with 3-4 statements testing detailed comprehension)
- 1 FILL_IN (specific detail: word, number, or short phrase)
Questions should test: main idea, specific details, speaker's attitude/opinion, inference.
All questions IN GERMAN. Distribute correct answers across A, B, C, D (NOT all the same letter).`,

        gap_fill: `Create an ACADEMIC/INFORMATIONAL recording IN GERMAN (2-3 minutes, ~300-450 words).
One speaker: Dozent/in, Nachrichtensprecher/in, or Dokumentarfilmerzähler/in.
Topic should be factual (Wissenschaft, Geschichte, Statistik, aktuelle Ereignisse aus DACH-Ländern).
Generate 3-4 subQuestions using a MIX of types:
- 1 CLOSED (multiple choice A-D) about the main idea or a key detail
- 1 TRUE_FALSE (with 2-3 statements)
- 1-2 FILL_IN (student writes a word, number, or short phrase heard in the recording — answers must be unambiguous)
All questions IN GERMAN.`,

        extended_mixed: `Create a COMPLEX RECORDING IN GERMAN (3-4 minutes, ~400-600 words).
Can be: Podiumsdiskussion, Radiosendung, multi-part Durchsage, Reportage.
2-3 speakers with distinct viewpoints.
Generate 5-6 subQuestions IN GERMAN using a MIX of types:
- 2 CLOSED (multiple choice A-D)
- 2 TRUE_FALSE (with 2-3 statements each)
- 1-2 FILL_IN (specific detail)
This is the hardest format — test inference, attitude, and detail simultaneously.`,
      }
    : {
        short_dialogue: `Create a SHORT DIALOGUE (4-8 exchanges, 30-60 seconds when read aloud).
Two speakers in a natural, everyday situation (shop, school, travel, phone call, etc.).
Generate exactly 1 multiple-choice question (4 options A-D) about the dialogue.
The question should test understanding of specific information, NOT general gist.`,

        monologue_tf: `Create a MONOLOGUE (1-2 minutes when read aloud, ~150-250 words).
One speaker: could be a tour guide, teacher, radio presenter, student giving a presentation, etc.
Generate 3-4 TRUE/FALSE statements that test detailed comprehension.
At least one statement should be a tricky paraphrase (true but worded differently).
At least one should contain a plausible-sounding detail that contradicts the recording.`,

        interview_mcq: `Create an INTERVIEW or CONVERSATION (2-3 minutes, ~250-400 words).
Two speakers: an interviewer and a guest (expert, traveler, artist, athlete, etc.).
Generate 3-4 multiple-choice questions (4 options A-D each).
Questions should test: main idea, specific details, speaker's attitude/opinion, inference.
Distribute correct answers across A, B, C, D (NOT all the same letter).`,

        gap_fill: `Create an ACADEMIC/INFORMATIONAL recording (2-3 minutes, ~300-450 words).
One speaker: lecturer, news reporter, or documentary narrator.
Topic should be factual (science, history, statistics, current affairs).
Generate 4-5 FILL_IN questions where the student writes a word, number, or short phrase heard in the recording.
Answers should be unambiguous — specific names, numbers, dates, or key terms.`,

        extended_mixed: `Create a COMPLEX RECORDING (3-4 minutes, ~400-600 words).
Can be: panel discussion, radio program, multi-part announcement.
2-3 speakers with distinct viewpoints.
Generate 5-6 questions using a MIX of types:
- 2 multiple-choice (A-D)
- 2 TRUE/FALSE (with 2 statements each)
- 1-2 FILL_IN (specific detail)
This is the hardest format — test inference, attitude, and detail simultaneously.`,
      };

  const langLabel = isDE ? "German" : "English";
  const langExamples = isDE
    ? {
        title: "Hotelzimmer buchen",
        contextPL: "Usłyszysz rozmowę dwóch przyjaciół na temat wakacji.",
        question: "Hören Sie die Aufnahme und beantworten Sie die Fragen.",
        questionText: "question text in German",
        speakerNames: "German names like Hans, Anna, Frau Müller, Herr Schmidt",
      }
    : {
        title: "Booking a hotel room",
        contextPL: "Usłyszysz rozmowę dwóch przyjaciół na temat wakacji.",
        question: "Listen to the recording and answer the questions.",
        questionText: "question text in English",
        speakerNames: "names",
      };

  const criticalRules = isDE
    ? `CRITICAL RULES:
1. The transcript must be ENTIRELY IN GERMAN and sound NATURAL when read aloud — use contractions (geht's, gibt's, ist's), modal particles (ja, doch, mal, eben, halt, eigentlich, schon, wohl), fillers (also, na ja, naja, ähm, tja), self-corrections where appropriate for the register.
2. For dialogues: clearly mark speakers as [Speaker 1] and [Speaker 2] (or ${langExamples.speakerNames}).
3. For MCQ: correct answers must be distributed across A/B/C/D — do NOT make A always correct.
4. ALL questions, ALL options, and the main instruction ("question" field) must be IN GERMAN.
5. The "contextPL" field must ALWAYS be IN POLISH — this is the only Polish text in the output.
6. Questions must be answerable ONLY from the recording — not from general knowledge.
7. Include subtle distractors — options that sound plausible but contradict specific details.
8. Content should reflect DACH countries (Deutschland, Österreich, Schweiz) and be relevant to 18-year-olds: Technologie, Reisen, Umwelt, soziale Medien, Beruf, Kultur, Gesundheit, Beziehungen, aktuelle Themen.
9. Use appropriate register: formal (Sie) for official/business contexts, informal (du) for friends/family/peers.
10. Use correct German orthography: Umlauts (ä, ö, ü), Eszett (ß), compound nouns (Führerscheinprüfung, Auslandsaufenthalt), separable verbs (ankommen, aufstehen, einkaufen) — split correctly in main clauses.
11. For PP level: stick to Alltag topics, simple sentence structures, common vocabulary. For PR level: use Konjunktiv II, Passiv, complex Nebensätze, academic register.`
    : `CRITICAL RULES:
1. The transcript must sound NATURAL when read aloud — use contractions, fillers (well, you know, actually), hesitations, self-corrections where appropriate for the register.
2. For dialogues: clearly mark speakers as [Speaker 1] and [Speaker 2] (or ${langExamples.speakerNames}).
3. For MCQ: correct answers must be distributed across A/B/C/D — do NOT make A always correct.
4. Questions must be answerable ONLY from the recording — not from general knowledge.
5. Include subtle distractors — options that sound plausible but contradict specific details.
6. Content should be interesting and relevant to 18-year-olds: technology, travel, environment, social media, careers, culture, health, relationships, current affairs.`;

  return `You are an expert ${langLabel} language matura exam creator for Polish students.

TASK: Create a listening comprehension exercise${isDE ? " IN GERMAN" : ""}.

LEVEL: ${levelDesc}
${topicHint}

FORMAT: ${patternInstructions[params.pattern]}

${criticalRules}

STRICT JSON SCHEMA — every field is REQUIRED exactly as shown:
- subQuestions[].id: STRING like "a", "b", "c" (NOT numbers)
- subQuestions[].text: STRING (the question text)
- subQuestions[].type: "CLOSED" | "TRUE_FALSE" | "FILL_IN"
- subQuestions[].points: NUMBER
- subQuestions[].options[].id: "A", "B", "C", "D" (NOT "letter", NOT lowercase)
- subQuestions[].correctAnswer: "A" | "B" | "C" | "D"
- DO NOT use "letter" field — use "id"
- DO NOT use "question" field in subQuestions — use "text"
- DO NOT use numeric ids — use string letters

RESPOND ONLY WITH THIS JSON (no markdown, no backticks, no extra text):
{
  "title": "<short descriptive title, e.g. '${langExamples.title}'>",
  "listeningType": "<monologue|dialogue|interview|announcement|news_report>",
  "transcript": "<full transcript${isDE ? " IN GERMAN" : ""} with [Speaker 1], [Speaker 2] labels if dialogue>",
  "speakers": [
    {"id": "1", "name": "<character name>", "gender": "female|male"}
  ],
  "contextPL": "<1 sentence in Polish describing what student will hear, e.g. '${langExamples.contextPL}'>",
  "question": "<main instruction${isDE ? " IN GERMAN" : " in English"}, e.g. '${langExamples.question}'>",
  "subQuestions": [
    {
      "id": "a",
      "text": "<${langExamples.questionText}>",
      "type": "CLOSED|TRUE_FALSE|FILL_IN",
      "points": <1 or 2>,
      "options": [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],
      "correctAnswer": "<A|B|C|D for CLOSED>",
      "statements": [{"text":"...","isTrue":true|false}],
      "acceptedAnswers": ["answer1","answer2"]
    }
  ],
  "difficulty": <1-5>,
  "estimatedDurationSec": <estimated seconds when read at natural pace>
}

Only include fields relevant to each subQuestion type (options+correctAnswer for CLOSED, statements for TRUE_FALSE, acceptedAnswers for FILL_IN).`;
}

// ── Parse Transcript into TTS Segments ───────────────────────────────────

interface ParsedSegment {
  speaker: string;
  text: string;
  voice: VoiceName;
  speed: number;
  pauseAfterMs: number;
}

function parseTranscriptToSegments(
  transcript: string,
  speakers: { id: string; name: string; gender: string }[],
  level: Level,
  language: Language = "en",
): ParsedSegment[] {
  const speed = level === "PP" ? 0.92 : 1.0;
  const voiceMap = new Map<string, VoiceName>();

  // Assign voices based on gender + language
  const maleVoices: VoiceName[] =
    language === "de"
      ? [VOICES.GERMAN_MALE, VOICES.GERMAN_MALE_2]
      : [VOICES.BRITISH_MALE, VOICES.BRITISH_MALE_2, VOICES.AMERICAN_MALE];

  const femaleVoices: VoiceName[] =
    language === "de"
      ? [VOICES.GERMAN_FEMALE, VOICES.GERMAN_FEMALE_2]
      : [
          VOICES.BRITISH_FEMALE,
          VOICES.BRITISH_FEMALE_2,
          VOICES.AMERICAN_FEMALE,
        ];

  let mi = 0,
    fi = 0;

  for (const sp of speakers) {
    if (sp.gender === "male") {
      voiceMap.set(sp.name, maleVoices[mi % maleVoices.length]);
      voiceMap.set(sp.id, maleVoices[mi % maleVoices.length]);
      voiceMap.set(`Speaker ${sp.id}`, maleVoices[mi % maleVoices.length]);
      mi++;
    } else {
      voiceMap.set(sp.name, femaleVoices[fi % femaleVoices.length]);
      voiceMap.set(sp.id, femaleVoices[fi % femaleVoices.length]);
      voiceMap.set(`Speaker ${sp.id}`, femaleVoices[fi % femaleVoices.length]);
      fi++;
    }
  }

  // Default voice for unlabeled text (monologues)
  const defaultVoice: VoiceName =
    speakers.length > 0
      ? voiceMap.get(speakers[0].name) ||
        (language === "de" ? VOICES.GERMAN_FEMALE : VOICES.BRITISH_FEMALE)
      : language === "de"
        ? VOICES.GERMAN_FEMALE
        : VOICES.BRITISH_FEMALE;

  // Split transcript by speaker labels: [Speaker 1], [Sarah], etc.
  const regex = /\[([^\]]+)\]\s*/g;
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;
  let currentSpeaker = speakers[0]?.name || "Narrator";
  let match: RegExpExecArray | null;

  // Check if transcript has speaker labels
  const hasLabels = regex.test(transcript);
  regex.lastIndex = 0; // reset

  if (!hasLabels) {
    // Monologue — split into sentence groups for natural pauses
    const sentences = transcript.match(/[^.!?]+[.!?]+/g) || [transcript];
    const chunkSize = 3;
    for (let i = 0; i < sentences.length; i += chunkSize) {
      const chunk = sentences
        .slice(i, i + chunkSize)
        .join(" ")
        .trim();
      if (chunk) {
        segments.push({
          speaker: currentSpeaker,
          text: chunk,
          voice: defaultVoice,
          speed,
          pauseAfterMs: 500,
        });
      }
    }
    return segments;
  }

  // Dialogue — split by speaker labels
  while ((match = regex.exec(transcript)) !== null) {
    if (match.index > lastIndex) {
      const text = transcript.slice(lastIndex, match.index).trim();
      if (text) {
        segments.push({
          speaker: currentSpeaker,
          text,
          voice: voiceMap.get(currentSpeaker) || defaultVoice,
          speed,
          pauseAfterMs: 700,
        });
      }
    }
    currentSpeaker = match[1].trim();
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last label
  const remaining = transcript.slice(lastIndex).trim();
  if (remaining) {
    segments.push({
      speaker: currentSpeaker,
      text: remaining,
      voice: voiceMap.get(currentSpeaker) || defaultVoice,
      speed,
      pauseAfterMs: 300,
    });
  }

  return segments;
}

// ── Main Generator ───────────────────────────────────────────────────────

export async function generateListeningQuestion(
  prisma: PrismaClient,
  params: GenerateParams,
): Promise<string> {
  const language: Language = params.language || "en";
  const prompt = buildPrompt(params);

  // 1. Call Claude to generate content
  console.log(
    `🧠 Generating ${params.pattern} (${params.level}, ${language.toUpperCase()})...`,
  );

  const result = await claudeCall({
    caller: "listening-batch-generator",
    model: "claude-sonnet-4-6",
    maxTokens: 16384,
    messages: [{ role: "user", content: prompt }],
    metadata: {
      pattern: params.pattern,
      level: params.level,
      topic: params.topic,
      language,
    },
  });
  const rawText = result.text;

  if (result.raw.stop_reason === "max_tokens") {
    console.error(
      `❌ Response truncated at ${rawText.length} chars (stop_reason=max_tokens). Retrying with shorter pattern...`,
    );
    // Retry once as short_dialogue which produces less text
    if (params.pattern !== "short_dialogue") {
      return generateListeningQuestion(prisma, {
        ...params,
        pattern: "short_dialogue",
      });
    }
    throw new Error("Response truncated even on short_dialogue pattern");
  }

  console.log(
    `📝 Response: ${rawText.length} chars, stop_reason=${result.raw.stop_reason}`,
  );

  // Clean potential markdown wrapping

  const jsonText = rawText
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  let generated: any;

  try {
    generated = JSON.parse(jsonText);
  } catch (e) {
    // Attempt to fix truncated JSON by closing open structures
    const fixed =
      jsonText.replace(/,\s*$/, "") + // trailing comma
      (jsonText.includes('"subQuestions"') ? "]}" : "}");
    try {
      generated = JSON.parse(fixed);
      console.warn("⚠ Fixed truncated JSON");
    } catch {
      console.error(
        "❌ Failed to parse Claude response:",
        rawText.slice(0, 300),
      );
      throw new Error(
        "Claude returned invalid JSON — response likely truncated. Check max_tokens.",
      );
    }
  }

  // 2. Parse transcript into TTS segments (language-aware voices)
  const segments = parseTranscriptToSegments(
    generated.transcript,
    generated.speakers || [],
    params.level,
    language,
  );

  // 3. Build full content object
  const content = {
    listeningType: generated.listeningType || "dialogue",
    transcript: generated.transcript,
    segments,
    audioUrl: null,
    audioDurationMs: null,
    maxPlays:
      params.level === "PR" && params.pattern === "extended_mixed" ? 1 : 2,
    contextPL: generated.contextPL,
    question:
      generated.question ||
      (language === "de"
        ? "Hören Sie die Aufnahme und beantworten Sie die Fragen."
        : "Listen to the recording and answer the questions."),
    subQuestions: generated.subQuestions,
  };

  // 4. Save to DB
  const question = await prisma.question.create({
    data: {
      subjectId: params.subjectId,
      topicId: params.topicId,
      type: "LISTENING",
      difficulty:
        params.difficulty ||
        generated.difficulty ||
        (params.level === "PP" ? 2 : 4),
      points: content.subQuestions.reduce(
        (s: number, q: any) => s + (q.points || 1),
        0,
      ),
      content: content as any,
      explanation: `Transcript: ${generated.transcript.slice(0, 200)}...`,
      source: params.level,
      isActive: true,
    },
  });

  // Update topic question count
  await prisma.topic.update({
    where: { id: params.topicId },
    data: { questionCount: { increment: 1 } },
  });

  console.log(
    `✅ Created question ${question.id} (${params.pattern}, ${language.toUpperCase()})`,
  );

  // 5. Generate audio immediately
  try {
    await generateListeningAudio(prisma, question.id);
  } catch (err: any) {
    console.warn(`⚠ Audio generation deferred: ${err.message}`);
  }

  return question.id;
}

// ── Batch Generator ──────────────────────────────────────────────────────

interface BatchParams {
  subjectId: string;
  topicId: string;
  level: Level;
  count: number;
  language?: Language;
  patterns?: ListeningPattern[];
  topics?: string[];
}

const DEFAULT_TOPICS_PP_EN = [
  "booking a hotel",
  "shopping for clothes",
  "visiting a doctor",
  "ordering food",
  "planning a trip",
  "discussing school",
  "talking about hobbies",
  "phone conversation",
  "at the airport",
  "job interview basics",
  "weather forecast",
  "birthday party planning",
  "asking for directions",
  "sports event",
  "movie review",
  "cooking a recipe",
  "daily routine",
  "public transport",
  "environmental awareness",
  "social media",
];

const DEFAULT_TOPICS_PR_EN = [
  "artificial intelligence ethics",
  "climate change solutions",
  "space exploration",
  "mental health awareness",
  "remote work culture",
  "cultural diversity",
  "sustainable fashion",
  "genetic engineering debate",
  "social media regulation",
  "education system reform",
  "housing crisis",
  "renewable energy economics",
  "digital privacy",
  "future of work",
  "migration patterns",
  "healthcare systems",
  "cybersecurity threats",
  "circular economy",
  "urban planning",
  "media literacy",
];

const DEFAULT_TOPICS_PP_DE = [
  "Hotelreservierung",
  "Einkaufen im Supermarkt",
  "Beim Arzt",
  "Im Restaurant bestellen",
  "Reiseplanung",
  "Schulleben",
  "Hobbys und Freizeit",
  "Telefonat mit Freunden",
  "Am Flughafen",
  "Vorstellungsgespräch",
  "Wetterbericht",
  "Geburtstagsfeier",
  "Nach dem Weg fragen",
  "Sportveranstaltung",
  "Filmkritik",
  "Kochen und Rezepte",
  "Tagesablauf",
  "Öffentliche Verkehrsmittel",
  "Umweltbewusstsein",
  "Soziale Medien",
];

const DEFAULT_TOPICS_PR_DE = [
  "Künstliche Intelligenz und Ethik",
  "Klimawandel und Lösungen",
  "Weltraumforschung",
  "Psychische Gesundheit",
  "Homeoffice und Remote-Arbeit",
  "Kulturelle Vielfalt",
  "Nachhaltige Mode",
  "Gentechnik-Debatte",
  "Regulierung sozialer Medien",
  "Bildungsreform",
  "Wohnungskrise",
  "Erneuerbare Energien",
  "Digitaler Datenschutz",
  "Zukunft der Arbeit",
  "Migration in Europa",
  "Gesundheitssysteme im Vergleich",
  "Cybersicherheit",
  "Kreislaufwirtschaft",
  "Stadtplanung und Urbanisierung",
  "Medienkompetenz",
];

const DEFAULT_PATTERNS_PP: ListeningPattern[] = [
  "short_dialogue",
  "short_dialogue",
  "short_dialogue",
  "monologue_tf",
  "monologue_tf",
  "interview_mcq",
];

const DEFAULT_PATTERNS_PR: ListeningPattern[] = [
  "interview_mcq",
  "interview_mcq",
  "gap_fill",
  "gap_fill",
  "monologue_tf",
  "extended_mixed",
];

export async function generateListeningBatch(
  prisma: PrismaClient,
  params: BatchParams,
): Promise<string[]> {
  const language: Language = params.language || "en";
  const patterns =
    params.patterns ||
    (params.level === "PP" ? DEFAULT_PATTERNS_PP : DEFAULT_PATTERNS_PR);

  const topicPool =
    params.topics ||
    (language === "de"
      ? params.level === "PP"
        ? DEFAULT_TOPICS_PP_DE
        : DEFAULT_TOPICS_PR_DE
      : params.level === "PP"
        ? DEFAULT_TOPICS_PP_EN
        : DEFAULT_TOPICS_PR_EN);

  const ids: string[] = [];

  for (let i = 0; i < params.count; i++) {
    const pattern = patterns[i % patterns.length];
    const topic = topicPool[i % topicPool.length];

    try {
      const id = await generateListeningQuestion(prisma, {
        subjectId: params.subjectId,
        topicId: params.topicId,
        pattern,
        level: params.level,
        topic,
        language,
      });
      ids.push(id);
      console.log(
        `  [${i + 1}/${params.count}] ✅ ${pattern}: ${topic} (${language.toUpperCase()})`,
      );
    } catch (err: any) {
      console.error(
        `  [${i + 1}/${params.count}] ❌ ${pattern}: ${err.message}`,
      );
    }

    // Rate limit: 1 req per 2 seconds
    if (i < params.count - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(
    `\n🎉 Batch complete: ${ids.length}/${params.count} questions generated (${language.toUpperCase()})`,
  );
  return ids;
}
