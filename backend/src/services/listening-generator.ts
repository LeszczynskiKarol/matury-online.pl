// ============================================================================
// Listening Content Generator — Claude Sonnet generates transcripts + questions
// backend/src/services/listening-generator.ts
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
  | "short_dialogue" // PP: 30-60s, 1 MCQ per dialogue
  | "monologue_tf" // PP: 1-2min monologue, 3-5 T/F statements
  | "interview_mcq" // PP/PR: 2-3min, 3-5 MCQ
  | "gap_fill" // PR: academic/news, fill missing info
  | "extended_mixed"; // PR: 3-4min, mixed question types

export type Level = "PP" | "PR";

interface GenerateParams {
  subjectId: string;
  topicId: string;
  pattern: ListeningPattern;
  level: Level;
  topic?: string; // e.g. "travel", "environment", "technology"
  difficulty?: number; // 1-5, auto-inferred from level if not set
}

// ── Voice Assignment Logic ───────────────────────────────────────────────

interface VoiceAssignment {
  speaker: string;
  voice: VoiceName;
}

function assignVoices(
  pattern: ListeningPattern,
  speakerCount: number,
): VoiceAssignment[] {
  const pool: VoiceAssignment[] = [
    { speaker: "Speaker 1", voice: VOICES.BRITISH_FEMALE },
    { speaker: "Speaker 2", voice: VOICES.BRITISH_MALE },
    { speaker: "Speaker 3", voice: VOICES.BRITISH_FEMALE_2 },
    { speaker: "Speaker 4", voice: VOICES.BRITISH_MALE_2 },
  ];

  if (pattern === "monologue_tf" || pattern === "gap_fill") {
    // Single speaker — alternate male/female randomly
    return [pool[Math.random() > 0.5 ? 0 : 1]];
  }

  return pool.slice(0, Math.min(speakerCount, 4));
}

// ── Prompt Templates ─────────────────────────────────────────────────────

function buildPrompt(params: GenerateParams): string {
  const levelDesc =
    params.level === "PP"
      ? "B1/B1+ (matura podstawowa). Simple, clear language. Speed: moderate."
      : "B2/C1 (matura rozszerzona). Complex vocabulary, nuanced arguments. Natural speed.";

  const topicHint = params.topic
    ? `Topic/theme: ${params.topic}.`
    : "Choose an interesting, varied topic appropriate for 18-year-old Polish students preparing for matura.";

  const patternInstructions: Record<ListeningPattern, string> = {
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

  return `You are an expert English language matura exam creator for Polish students.

TASK: Create a listening comprehension exercise.

LEVEL: ${levelDesc}
${topicHint}

FORMAT: ${patternInstructions[params.pattern]}

CRITICAL RULES:
1. The transcript must sound NATURAL when read aloud — use contractions, fillers (well, you know, actually), hesitations, self-corrections where appropriate for the register.
2. For dialogues: clearly mark speakers as [Speaker 1] and [Speaker 2] (or names).
3. For MCQ: correct answers must be distributed across A/B/C/D — do NOT make A always correct.
4. Questions must be answerable ONLY from the recording — not from general knowledge.
5. Include subtle distractors — options that sound plausible but contradict specific details.
6. Content should be interesting and relevant to 18-year-olds: technology, travel, environment, social media, careers, culture, health, relationships, current affairs.

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
  "title": "<short descriptive title, e.g. 'Booking a hotel room'>",
  "listeningType": "<monologue|dialogue|interview|announcement|news_report>",
  "transcript": "<full transcript with [Speaker 1], [Speaker 2] labels if dialogue>",
  "speakers": [
    {"id": "1", "name": "<character name>", "gender": "female|male"}
  ],
  "contextPL": "<1 sentence in Polish describing what student will hear, e.g. 'Usłyszysz rozmowę dwóch przyjaciół na temat wakacji.'>",
  "question": "<main instruction in English, e.g. 'Listen to the recording and answer the questions.'>",
  "subQuestions": [
    {
      "id": "a",
      "text": "<question text in English>",
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
): ParsedSegment[] {
  const speed = level === "PP" ? 0.92 : 1.0;
  const voiceMap = new Map<string, VoiceName>();

  // Assign voices based on gender
  const maleVoices = [
    VOICES.BRITISH_MALE,
    VOICES.BRITISH_MALE_2,
    VOICES.AMERICAN_MALE,
  ];
  const femaleVoices = [
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
  const defaultVoice =
    speakers.length > 0
      ? voiceMap.get(speakers[0].name) || VOICES.BRITISH_FEMALE
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
    // Monologue — single segment, maybe split into sentences for natural pauses
    const sentences = transcript.match(/[^.!?]+[.!?]+/g) || [transcript];
    const chunkSize = 3; // group 3 sentences per segment
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
    // Text before this label belongs to previous speaker
    if (match.index > lastIndex) {
      const text = transcript.slice(lastIndex, match.index).trim();
      if (text) {
        segments.push({
          speaker: currentSpeaker,
          text,
          voice: voiceMap.get(currentSpeaker) || defaultVoice,
          speed,
          pauseAfterMs: 700, // longer pause between speakers
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
  const prompt = buildPrompt(params);

  // 1. Call Claude to generate content
  console.log(`🧠 Generating ${params.pattern} (${params.level})...`);

  const result = await claudeCall({
    caller: "listening-batch-generator",
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: prompt }],
    metadata: {
      pattern: params.pattern,
      level: params.level,
      topic: params.topic,
    },
  });
  const rawText = result.text;

  // Clean potential markdown wrapping
  const jsonText = rawText
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  let generated: any;

  try {
    generated = JSON.parse(jsonText);
  } catch (e) {
    console.error("❌ Failed to parse Claude response:", rawText.slice(0, 200));
    throw new Error("Claude returned invalid JSON");
  }

  // 2. Parse transcript into TTS segments
  const segments = parseTranscriptToSegments(
    generated.transcript,
    generated.speakers || [],
    params.level,
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
      generated.question || "Listen to the recording and answer the questions.",
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

  console.log(`✅ Created question ${question.id} (${params.pattern})`);

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
  patterns?: ListeningPattern[];
  topics?: string[];
}

const DEFAULT_TOPICS_PP = [
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

const DEFAULT_TOPICS_PR = [
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
  const patterns =
    params.patterns ||
    (params.level === "PP" ? DEFAULT_PATTERNS_PP : DEFAULT_PATTERNS_PR);
  const topicPool =
    params.topics ||
    (params.level === "PP" ? DEFAULT_TOPICS_PP : DEFAULT_TOPICS_PR);

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
      });
      ids.push(id);
      console.log(`  [${i + 1}/${params.count}] ✅ ${pattern}: ${topic}`);
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
    `\n🎉 Batch complete: ${ids.length}/${params.count} questions generated`,
  );
  return ids;
}
