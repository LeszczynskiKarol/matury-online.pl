// ============================================================================
// TTS Service — Google Cloud Text-to-Speech + S3 upload
// backend/src/services/tts.service.ts
// ============================================================================
//
// Requires:
//   npm i @google-cloud/text-to-speech
//   Google Cloud credentials (GOOGLE_APPLICATION_CREDENTIALS env or default)
//   ffmpeg installed on server (for merging multi-speaker segments)
//
// Usage:
//   import { generateListeningAudio } from './services/tts.service.js';
//   const url = await generateListeningAudio(prisma, questionId);
// ============================================================================

import textToSpeech from "@google-cloud/text-to-speech";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

// ── Voice Presets ────────────────────────────────────────────────────────

export const VOICES = {
  // British English
  BRITISH_FEMALE: "en-GB-Neural2-A",
  BRITISH_MALE: "en-GB-Neural2-B",
  BRITISH_FEMALE_2: "en-GB-Neural2-C",
  BRITISH_MALE_2: "en-GB-Neural2-D",
  // American English
  AMERICAN_FEMALE: "en-US-Neural2-C",
  AMERICAN_MALE: "en-US-Neural2-D",
  AMERICAN_FEMALE_2: "en-US-Neural2-E",
  AMERICAN_MALE_2: "en-US-Neural2-A",
  // Australian
  AUSTRALIAN_FEMALE: "en-AU-Neural2-A",
  AUSTRALIAN_MALE: "en-AU-Neural2-B",
} as const;

export type VoiceName = (typeof VOICES)[keyof typeof VOICES];

// ── Types ────────────────────────────────────────────────────────────────

export interface TTSSegment {
  speaker: string; // "Narrator", "Sarah", "Tom", etc.
  text: string;
  voice: VoiceName;
  speed?: number; // 0.7–1.3, default 1.0
  pauseAfterMs?: number; // silence after this segment, default 500
}

export interface ListeningContent {
  listeningType:
    | "monologue"
    | "dialogue"
    | "interview"
    | "announcement"
    | "news_report";
  transcript: string; // plain text for display/debug
  segments: TTSSegment[];
  audioUrl: string | null; // filled after generation
  audioDurationMs: number | null;
  maxPlays: number; // 1 or 2 (matura standard: 2)
  contextPL: string; // instruction in Polish: "Usłyszysz rozmowę..."
  question: string; // main question/instruction
  subQuestions: SubQuestion[];
}

export interface SubQuestion {
  id: string;
  text: string;
  type: "CLOSED" | "TRUE_FALSE" | "OPEN" | "FILL_IN";
  points: number;
  options?: { id: string; text: string }[];
  correctAnswer?: string;
  statements?: { text: string; isTrue: boolean }[];
  acceptedAnswers?: string[];
}

// ── S3 Config ────────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: process.env.S3_AUDIO_REGION || "eu-north-1",
});
const S3_BUCKET = process.env.S3_BUCKET_AUDIO || "matury-online-audio";
const S3_PREFIX = "listening/";
const CDN_BASE =
  process.env.CDN_AUDIO_URL ||
  `https://${S3_BUCKET}.s3.${process.env.S3_AUDIO_REGION || "eu-north-1"}.amazonaws.com`;

// ── Core TTS Function ────────────────────────────────────────────────────

const ttsClient = new textToSpeech.TextToSpeechClient();

async function synthesizeSegment(segment: TTSSegment): Promise<Buffer> {
  const pauseMs = segment.pauseAfterMs ?? 600;
  const ssml = `<speak>${segment.text}<break time="${pauseMs}ms"/></speak>`;

  const [response] = await ttsClient.synthesizeSpeech({
    input: { ssml },
    voice: {
      languageCode: segment.voice.startsWith("en-GB")
        ? "en-GB"
        : segment.voice.startsWith("en-AU")
          ? "en-AU"
          : "en-US",
      name: segment.voice,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: segment.speed || 1.0,
      pitch: 0,
      sampleRateHertz: 24000,
    },
  });

  return Buffer.from(response.audioContent as Uint8Array);
}

// ── Main Generation Pipeline ─────────────────────────────────────────────

export async function generateAudioForSegments(
  segments: TTSSegment[],
): Promise<{
  buffer: Buffer;
  durationMs: number;
}> {
  const buffers: Buffer[] = [];

  for (const seg of segments) {
    const audioBuffer = await synthesizeSegment(seg);
    buffers.push(audioBuffer);
  }

  // MP3 is frame-based — simple concat works
  const buffer = Buffer.concat(buffers);

  // Estimate duration from buffer size (MP3 128kbps ≈ 16000 bytes/sec)
  const durationMs = Math.round((buffer.length / 16000) * 1000);

  return { buffer, durationMs };
}

// ── Upload to S3 ─────────────────────────────────────────────────────────

async function uploadToS3(buffer: Buffer, key: string): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "audio/mpeg",
      CacheControl: "public, max-age=31536000",
    }),
  );
  return `${CDN_BASE}/${key}`;
}

// ── Generate Audio for a Question ────────────────────────────────────────

export async function generateListeningAudio(
  prisma: PrismaClient,
  questionId: string,
): Promise<string> {
  const question = await prisma.question.findUniqueOrThrow({
    where: { id: questionId },
  });

  const content = question.content as unknown as ListeningContent;

  if (!content.segments || content.segments.length === 0) {
    throw new Error(`Question ${questionId} has no TTS segments`);
  }

  if (content.audioUrl) {
    console.log(`⏭ Audio already exists: ${content.audioUrl}`);
    return content.audioUrl;
  }

  console.log(
    `🎙 Generating audio for ${questionId} (${content.segments.length} segments)...`,
  );

  const { buffer, durationMs } = await generateAudioForSegments(
    content.segments,
  );

  const s3Key = `${S3_PREFIX}${questionId}.mp3`;
  const audioUrl = await uploadToS3(buffer, s3Key);

  // Update question with audio URL
  await prisma.question.update({
    where: { id: questionId },
    data: {
      content: {
        ...(question.content as any),
        audioUrl,
        audioDurationMs: durationMs,
      },
    },
  });

  console.log(
    `✅ ${questionId}: ${audioUrl} (${Math.round(durationMs / 1000)}s)`,
  );
  return audioUrl;
}

// ── Batch Generate All Missing Audio ─────────────────────────────────────

export async function generateAllMissingAudio(
  prisma: PrismaClient,
): Promise<number> {
  const questions = await prisma.question.findMany({
    where: { type: "LISTENING", isActive: true },
    select: { id: true, content: true },
  });

  let generated = 0;
  for (const q of questions) {
    const content = q.content as any;
    if (!content.audioUrl) {
      try {
        await generateListeningAudio(prisma, q.id);
        generated++;
      } catch (err: any) {
        console.error(`❌ ${q.id}: ${err.message}`);
      }
    }
  }

  console.log(
    `\n✅ Generated audio for ${generated}/${questions.length} questions`,
  );
  return generated;
}
