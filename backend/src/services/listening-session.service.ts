// ============================================================================
// Live Listening Session — generates questions ON DEMAND during user sessions
// backend/src/services/listening-session.service.ts
//
// Flow:
//  1. User starts session → first listening Q generated immediately (~8-12s)
//  2. User listens + answers (~2-3 min)
//  3. WHILE user works → next Q pre-generated in background
//  4. User clicks "next" → Q already ready, zero wait
//
// Integration: called from session routes, NOT admin panel
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { claudeCall } from "./claude-monitor.js";
import {
  VOICES,
  type VoiceName,
  generateAudioForSegments,
} from "./tts.service.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const s3 = new S3Client({
  region: process.env.S3_AUDIO_REGION || "eu-north-1",
});
const S3_BUCKET = process.env.S3_BUCKET_AUDIO || "matury-online-audio";
const CDN_BASE =
  process.env.CDN_AUDIO_URL ||
  `https://${S3_BUCKET}.s3.${process.env.S3_AUDIO_REGION || "eu-north-1"}.amazonaws.com`;

// ── In-memory prefetch cache ─────────────────────────────────────────────
// Key: sessionId, Value: Promise that resolves to a generated question
const prefetchCache = new Map<string, Promise<GeneratedListening>>();

interface GeneratedListening {
  questionId: string;
  content: any;
  audioUrl: string;
}

// ── Difficulty / pattern mapping ─────────────────────────────────────────

type ListeningPattern =
  | "short_dialogue"
  | "monologue_tf"
  | "interview_mcq"
  | "gap_fill"
  | "extended_mixed";

function pickPattern(difficulty: number): ListeningPattern {
  if (difficulty <= 2)
    return Math.random() > 0.5 ? "short_dialogue" : "monologue_tf";
  if (difficulty <= 3)
    return Math.random() > 0.5 ? "monologue_tf" : "interview_mcq";
  if (difficulty <= 4)
    return Math.random() > 0.5 ? "interview_mcq" : "gap_fill";
  return Math.random() > 0.5 ? "gap_fill" : "extended_mixed";
}

function pickTopic(difficulty: number): string {
  const easy = [
    "booking a hotel room",
    "ordering food at a restaurant",
    "asking for directions",
    "shopping for clothes",
    "planning a weekend trip",
    "talking about hobbies",
    "making a doctor's appointment",
    "discussing school subjects",
    "phone conversation with a friend",
    "buying train tickets",
    "weather forecast",
    "daily routine description",
  ];
  const hard = [
    "artificial intelligence in education",
    "climate change solutions",
    "remote work culture",
    "social media's impact on mental health",
    "renewable energy debate",
    "genetic engineering ethics",
    "future of space exploration",
    "digital privacy concerns",
    "immigration policy",
    "housing crisis in major cities",
    "media literacy and fake news",
    "sustainable fashion",
  ];
  return difficulty <= 3
    ? easy[Math.floor(Math.random() * easy.length)]
    : hard[Math.floor(Math.random() * hard.length)];
}

// ── Core: generate one listening question ────────────────────────────────

async function generateOne(
  prisma: PrismaClient,
  params: {
    subjectId: string;
    topicId: string;
    difficulty: number;
    userId: string;
  },
): Promise<GeneratedListening> {
  const pattern = pickPattern(params.difficulty);
  const topic = pickTopic(params.difficulty);
  const level = params.difficulty <= 3 ? "PP" : "PR";

  // 1. Claude generates content
  const prompt = buildPrompt(pattern, level, topic);

  const result = await claudeCall({
    caller: "listening-generator",
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: prompt }],
    userId: params.userId,
    metadata: { pattern, topic, level },
  });
  const raw = result.text;

  const parsed = JSON.parse(
    raw
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim(),
  );

  // 2. Parse segments
  const segments = parseSegments(
    parsed.transcript,
    parsed.speakers || [],
    level,
  );

  // 3. Generate audio
  const { buffer, durationMs } = await generateAudioForSegments(segments);

  // 4. Upload to S3
  const s3Key = `listening/live_${randomUUID()}.mp3`;
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: "audio/mpeg",
      CacheControl: "public, max-age=31536000",
    }),
  );
  const audioUrl = `${CDN_BASE}/${s3Key}`;

  // 5. Build content
  const content = {
    listeningType: parsed.listeningType || "dialogue",
    transcript: parsed.transcript,
    segments,
    audioUrl,
    audioDurationMs: durationMs,
    maxPlays: level === "PR" && pattern === "extended_mixed" ? 1 : 2,
    contextPL: parsed.contextPL,
    question:
      parsed.question || "Listen to the recording and answer the questions.",
    subQuestions: parsed.subQuestions,
  };

  // 6. Save to DB (becomes part of question pool for future reuse too)
  const question = await prisma.question.create({
    data: {
      subjectId: params.subjectId,
      topicId: params.topicId,
      type: "LISTENING",
      difficulty: params.difficulty,
      points: content.subQuestions.reduce(
        (s: number, q: any) => s + (q.points || 1),
        0,
      ),
      content: content as any,
      explanation: `[Live generated] ${parsed.title || topic}`,
      source: level,
      isActive: true,
    },
  });

  if (!audioUrl) {
    throw new Error("Audio generation failed — question not ready");
  }

  await prisma.topic.update({
    where: { id: params.topicId },
    data: { questionCount: { increment: 1 } },
  });

  return { questionId: question.id, content, audioUrl };
}

// ── Public API: get next listening question for session ───────────────────

export async function getNextListeningQuestion(
  prisma: PrismaClient,
  params: {
    sessionId: string;
    subjectId: string;
    topicId: string;
    difficulty: number;
    userId: string;
  },
): Promise<GeneratedListening> {
  const cacheKey = params.sessionId;

  // Check if we have a prefetched question ready
  if (prefetchCache.has(cacheKey)) {
    const prefetched = prefetchCache.get(cacheKey)!;
    prefetchCache.delete(cacheKey);

    // Start prefetching the NEXT one immediately
    triggerPrefetch(prisma, params);

    return await prefetched;
  }

  // No prefetch available — generate now + start prefetching next
  const result = await generateOne(prisma, params);

  // Prefetch next in background
  triggerPrefetch(prisma, params);

  return result;
}

// ── Prefetch: generate next question in background ───────────────────────

async function triggerPrefetch(
  prisma: PrismaClient,
  params: {
    sessionId: string;
    subjectId: string;
    topicId: string;
    difficulty: number;
    userId: string;
  },
) {
  if (prefetchCache.has(params.sessionId)) return;

  // Don't prefetch if user is low on credits — they might not afford next Q
  try {
    const { checkAiCredits } = await import("./ai-credits.js");
    const { remaining } = await checkAiCredits(prisma, params.userId);
    if (remaining < 5) return; // threshold: don't waste generation on near-empty accounts
  } catch {
    return; // if check fails, skip prefetch safely
  }

  const promise = generateOne(prisma, {
    subjectId: params.subjectId,
    topicId: params.topicId,
    difficulty: params.difficulty,
    userId: params.userId,
  }).catch((err) => {
    console.error(
      `Prefetch failed for session ${params.sessionId}:`,
      err.message,
    );
    prefetchCache.delete(params.sessionId);
    throw err;
  });

  prefetchCache.set(params.sessionId, promise);
}

// ── Cleanup: remove stale prefetches ─────────────────────────────────────

export function cleanupPrefetch(sessionId: string) {
  prefetchCache.delete(sessionId);
}

// ── Prompt builder ───────────────────────────────────────────────────────

function buildPrompt(
  pattern: ListeningPattern,
  level: string,
  topic: string,
): string {
  const levelDesc =
    level === "PP"
      ? "B1/B1+ (basic matura). Simple, clear language. Moderate speed."
      : "B2/C1 (advanced matura). Complex vocabulary, nuanced arguments.";

  const patterns: Record<string, string> = {
    short_dialogue: `SHORT DIALOGUE (4-8 exchanges, 30-60 seconds read aloud). Two speakers in everyday situation. Generate 1 multiple-choice question (A-D).`,
    monologue_tf: `MONOLOGUE (1-2 minutes, 150-250 words). One speaker. Generate 3-4 TRUE/FALSE statements. Include tricky paraphrases.`,
    interview_mcq: `INTERVIEW (2-3 minutes, 250-400 words). Two speakers. Generate 3-4 multiple-choice questions (A-D). Test: main idea, details, attitude.`,
    gap_fill: `ACADEMIC RECORDING (2-3 minutes, 300-450 words). One speaker (lecturer/reporter). Generate 4-5 FILL_IN questions — specific words, numbers, key terms.`,
    extended_mixed: `COMPLEX RECORDING (3-4 minutes, 400-600 words). 2-3 speakers. Generate 5-6 MIXED questions: 2 MCQ + 2 TRUE_FALSE + 1-2 FILL_IN.`,
  };

  return `You are an expert English matura exam creator for Polish students.

LEVEL: ${levelDesc}
TOPIC: ${topic}
FORMAT: ${patterns[pattern]}

RULES:
1. Natural spoken English — contractions, fillers (well, actually, you know), appropriate for the level.
2. For dialogues: mark speakers as [Speaker Name].
3. MCQ correct answers: distribute across A/B/C/D — NOT always A.
4. Questions answerable ONLY from the recording, not general knowledge.
5. Content relevant to 18-year-olds.

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

RESPOND WITH ONLY THIS JSON (no markdown, no backticks):
{
  "title": "<short title>",
  "listeningType": "<monologue|dialogue|interview|announcement|news_report>",
  "transcript": "<full transcript with [Speaker] labels if dialogue>",
  "speakers": [{"id":"1","name":"<name>","gender":"female|male"}],
  "contextPL": "<1 sentence in Polish: what student will hear>",
  "question": "<instruction in English>",
  "subQuestions": [
    {"id":"a","text":"<question>","type":"CLOSED","points":1,"options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correctAnswer":"<A|B|C|D>"},
    {"id":"b","text":"<question>","type":"TRUE_FALSE","points":2,"statements":[{"text":"...","isTrue":true},{"text":"...","isTrue":false}]},
    {"id":"c","text":"<question>","type":"FILL_IN","points":1,"acceptedAnswers":["answer1","answer2"]}
  ],
  "difficulty": <1-5>,
  "estimatedDurationSec": <number>
}`;
}

// ── Segment parser ───────────────────────────────────────────────────────

function parseSegments(transcript: string, speakers: any[], level: string) {
  const speed = level === "PP" ? 0.92 : 1.0;
  const maleVoices: VoiceName[] = [VOICES.BRITISH_MALE, VOICES.BRITISH_MALE_2];
  const femaleVoices: VoiceName[] = [
    VOICES.BRITISH_FEMALE,
    VOICES.BRITISH_FEMALE_2,
  ];

  const voiceMap = new Map<string, VoiceName>();
  let mi = 0,
    fi = 0;
  for (const sp of speakers) {
    const v =
      sp.gender === "male" ? maleVoices[mi++ % 2] : femaleVoices[fi++ % 2];
    voiceMap.set(sp.name, v);
    voiceMap.set(`Speaker ${sp.id}`, v);
  }

  const defaultVoice = speakers[0]
    ? voiceMap.get(speakers[0].name) || VOICES.BRITISH_FEMALE
    : VOICES.BRITISH_FEMALE;

  const regex = /\[([^\]]+)\]\s*/g;
  const hasLabels = regex.test(transcript);
  regex.lastIndex = 0;

  if (!hasLabels) {
    const sentences = transcript.match(/[^.!?]+[.!?]+/g) || [transcript];
    const segs = [];
    for (let i = 0; i < sentences.length; i += 3) {
      const chunk = sentences
        .slice(i, i + 3)
        .join(" ")
        .trim();
      if (chunk)
        segs.push({
          speaker: speakers[0]?.name || "Narrator",
          text: chunk,
          voice: defaultVoice,
          speed,
          pauseAfterMs: 500,
        });
    }
    return segs;
  }

  const segments: any[] = [];
  let lastIndex = 0;
  let currentSpeaker = speakers[0]?.name || "Speaker 1";
  let match;

  while ((match = regex.exec(transcript)) !== null) {
    if (match.index > lastIndex) {
      const text = transcript.slice(lastIndex, match.index).trim();
      if (text)
        segments.push({
          speaker: currentSpeaker,
          text,
          voice: voiceMap.get(currentSpeaker) || defaultVoice,
          speed,
          pauseAfterMs: 700,
        });
    }
    currentSpeaker = match[1].trim();
    lastIndex = match.index + match[0].length;
  }

  const remaining = transcript.slice(lastIndex).trim();
  if (remaining)
    segments.push({
      speaker: currentSpeaker,
      text: remaining,
      voice: voiceMap.get(currentSpeaker) || defaultVoice,
      speed,
      pauseAfterMs: 300,
    });

  return segments;
}
