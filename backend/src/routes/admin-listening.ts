// ============================================================================
// Admin Listening Lab — step-by-step generation with full debug output
// backend/src/routes/admin-listening.ts
//
// POST /admin/listening/generate  — full pipeline, returns all intermediate data
// POST /admin/listening/preview   — Claude only (no TTS, no DB save)
// POST /admin/listening/tts       — generate audio for existing question
// ============================================================================

import { FastifyPluginAsync } from "fastify";
import { VOICES } from "../services/tts.service.js";
import {
  type ListeningPattern,
  type Level,
} from "../services/listening-generator.js";
import { generateListeningAudio } from "../services/tts.service.js";
import { claudeCall } from "../services/claude-monitor.js";

export const adminListeningRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.requireAdmin);

  // ── PREVIEW: Claude only — no DB, no TTS ─────────────────────────────
  app.post("/listening/preview", async (req) => {
    const { pattern, level, topic } = req.body as {
      pattern: ListeningPattern;
      level: Level;
      topic?: string;
    };

    const steps: any[] = [];
    const timings: Record<string, number> = {};

    // Step 1: Build prompt
    const t0 = Date.now();
    const prompt = buildDebugPrompt(pattern, level, topic);
    timings.promptBuild = Date.now() - t0;

    steps.push({
      step: 1,
      name: "Prompt",
      status: "done",
      data: { prompt, charCount: prompt.length },
    });

    // Step 2: Call Claude
    const t1 = Date.now();
    let rawResponse = "";
    let parsed: any = null;
    let claudeError: string | null = null;

    try {
      const result = await claudeCall({
        caller: "admin-listening-lab",
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: prompt }],
      });

      rawResponse = result.text;
      timings.claudeApi = Date.now() - t1;

      steps.push({
        step: 2,
        name: "Claude API",
        status: "done",
        data: {
          rawResponse,
          charCount: rawResponse.length,
          model: "claude-sonnet-4-6",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costEstimate: `~$${result.costUsd.toFixed(4)}`,
        },
      });

      // Step 3: Parse JSON
      const t2 = Date.now();
      const jsonText = rawResponse
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(jsonText);
      timings.parse = Date.now() - t2;

      steps.push({
        step: 3,
        name: "Parse JSON",
        status: "done",
        data: {
          parsed,
          speakerCount: parsed.speakers?.length || 0,
          subQuestionCount: parsed.subQuestions?.length || 0,
          estimatedDuration: `${parsed.estimatedDurationSec || "?"}s`,
          transcriptWordCount: parsed.transcript?.split(/\s+/).length || 0,
        },
      });

      // Step 4: Segments preview
      const t3 = Date.now();
      const segments = parseSegmentsPreview(
        parsed.transcript,
        parsed.speakers || [],
        level,
      );
      timings.segmentParse = Date.now() - t3;

      steps.push({
        step: 4,
        name: "TTS Segments",
        status: "done",
        data: {
          segments,
          segmentCount: segments.length,
          totalChars: segments.reduce(
            (s: number, seg: any) => s + seg.text.length,
            0,
          ),
          voices: [...new Set(segments.map((s: any) => s.voice))],
        },
      });

      steps.push({
        step: 5,
        name: "DB Save",
        status: "skipped",
        data: { message: "Preview mode" },
      });
      steps.push({
        step: 6,
        name: "TTS Audio",
        status: "skipped",
        data: { message: "Preview mode" },
      });
    } catch (e: any) {
      claudeError = e.message;
      steps.push({
        step: 2,
        name: "Claude API",
        status: "error",
        data: { error: e.message },
      });
    }

    return {
      steps,
      timings,
      totalTimeMs: Date.now() - t0,
      success: !claudeError,
    };
  });

  // ── FULL GENERATE: Claude → DB → TTS → S3 ────────────────────────────
  app.post("/listening/generate", async (req) => {
    const { pattern, level, topic } = req.body as {
      pattern: ListeningPattern;
      level: Level;
      topic?: string;
    };

    const steps: any[] = [];
    const t0 = Date.now();

    // Find subject + topic
    const subject = await app.prisma.subject.findUnique({
      where: { slug: "angielski" },
    });
    if (!subject) {
      return {
        steps: [
          {
            step: 0,
            status: "error",
            data: { error: "Subject 'angielski' not found" },
          },
        ],
        success: false,
      };
    }

    let listeningTopic = await app.prisma.topic.findFirst({
      where: { subjectId: subject.id, slug: "sluchanie" },
    });
    if (!listeningTopic) {
      listeningTopic = await app.prisma.topic.create({
        data: {
          subjectId: subject.id,
          slug: "sluchanie",
          name: "XIV. Rozumienie ze słuchu",
          sortOrder: 14,
          depth: 0,
          isActive: true,
        },
      });
    }

    // Step 1: Prompt
    const prompt = buildDebugPrompt(pattern, level, topic);
    steps.push({ step: 1, name: "Prompt", status: "done", data: { prompt } });

    // Step 2: Claude
    const t1 = Date.now();
    let parsed: any;
    try {
      const result = await claudeCall({
        caller: "admin-listening-lab",
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: prompt }],
      });

      const raw = result.text;

      steps.push({
        step: 2,
        name: "Claude API",
        status: "done",
        data: {
          rawResponse: raw,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          timeMs: Date.now() - t1,
        },
      });

      parsed = JSON.parse(
        raw
          .replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .trim(),
      );
      steps.push({
        step: 3,
        name: "Parse JSON",
        status: "done",
        data: { parsed },
      });
    } catch (e: any) {
      steps.push({
        step: 2,
        name: "Claude API",
        status: "error",
        data: { error: e.message },
      });
      return { steps, success: false, totalTimeMs: Date.now() - t0 };
    }

    // Step 4: Segments
    const segments = parseSegmentsPreview(
      parsed.transcript,
      parsed.speakers || [],
      level,
    );
    steps.push({
      step: 4,
      name: "TTS Segments",
      status: "done",
      data: { segments },
    });

    // Step 5: Save to DB
    const t5 = Date.now();
    const content = {
      listeningType: parsed.listeningType || "dialogue",
      transcript: parsed.transcript,
      segments,
      audioUrl: null,
      audioDurationMs: null,
      maxPlays: level === "PR" && pattern === "extended_mixed" ? 1 : 2,
      contextPL: parsed.contextPL,
      question: parsed.question || "Listen and answer.",
      subQuestions: parsed.subQuestions,
    };

    const question = await app.prisma.question.create({
      data: {
        subjectId: subject.id,
        topicId: listeningTopic.id,
        type: "LISTENING",
        difficulty: parsed.difficulty || (level === "PP" ? 2 : 4),
        points: content.subQuestions.reduce(
          (s: number, q: any) => s + (q.points || 1),
          0,
        ),
        content: content as any,
        explanation: parsed.transcript?.slice(0, 300),
        source: level,
        isActive: true,
      },
    });

    await app.prisma.topic.update({
      where: { id: listeningTopic.id },
      data: { questionCount: { increment: 1 } },
    });

    steps.push({
      step: 5,
      name: "DB Save",
      status: "done",
      data: { questionId: question.id, timeMs: Date.now() - t5 },
    });

    // Step 6: TTS
    const t6 = Date.now();
    try {
      const audioUrl = await generateListeningAudio(app.prisma, question.id);
      steps.push({
        step: 6,
        name: "TTS + S3",
        status: "done",
        data: { audioUrl, timeMs: Date.now() - t6 },
      });
    } catch (e: any) {
      steps.push({
        step: 6,
        name: "TTS + S3",
        status: "error",
        data: { error: e.message, timeMs: Date.now() - t6 },
      });
    }

    return {
      steps,
      questionId: question.id,
      success: true,
      totalTimeMs: Date.now() - t0,
    };
  });

  // ── RE-GENERATE AUDIO for existing question ───────────────────────────
  app.post("/listening/tts/:id", async (req) => {
    const { id } = req.params as { id: string };
    const t0 = Date.now();
    try {
      const url = await generateListeningAudio(app.prisma, id);
      return { audioUrl: url, timeMs: Date.now() - t0 };
    } catch (e: any) {
      return { error: e.message, timeMs: Date.now() - t0 };
    }
  });
};

// ── Helpers ──────────────────────────────────────────────────────────────

function parseSegmentsPreview(
  transcript: string,
  speakers: any[],
  level: Level,
) {
  const speed = level === "PP" ? 0.92 : 1.0;
  const maleVoices = [VOICES.BRITISH_MALE, VOICES.BRITISH_MALE_2];
  const femaleVoices = [VOICES.BRITISH_FEMALE, VOICES.BRITISH_FEMALE_2];

  const voiceMap = new Map<string, string>();
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
    const segments = [];
    for (let i = 0; i < sentences.length; i += 3) {
      const chunk = sentences
        .slice(i, i + 3)
        .join(" ")
        .trim();
      if (chunk)
        segments.push({
          speaker: speakers[0]?.name || "Narrator",
          text: chunk,
          voice: defaultVoice,
          speed,
          pauseAfterMs: 500,
        });
    }
    return segments;
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

function buildDebugPrompt(
  pattern: ListeningPattern,
  level: Level,
  topic?: string,
): string {
  // Reuse the same prompt logic from listening-generator
  // Imported inline to keep this file self-contained for debug
  const levelDesc =
    level === "PP"
      ? "B1/B1+ (matura podstawowa). Simple, clear language. Speed: moderate."
      : "B2/C1 (matura rozszerzona). Complex vocabulary, nuanced arguments. Natural speed.";

  const topicHint = topic
    ? `Topic/theme: ${topic}.`
    : "Choose an interesting, varied topic appropriate for 18-year-old Polish students.";

  const patterns: Record<string, string> = {
    short_dialogue: `Create a SHORT DIALOGUE (4-8 exchanges, 30-60s). Two speakers. 1 MCQ (4 options A-D).`,
    monologue_tf: `Create a MONOLOGUE (1-2min, ~150-250 words). 3-4 TRUE/FALSE statements. Include tricky paraphrases.`,
    interview_mcq: `Create an INTERVIEW (2-3min, ~250-400 words). 3-4 MCQ. Test: main idea, details, attitude, inference.`,
    gap_fill: `Create an ACADEMIC recording (2-3min, ~300-450 words). 4-5 FILL_IN questions (specific words/numbers).`,
    extended_mixed: `Create a COMPLEX recording (3-4min, ~400-600 words). 2-3 speakers. 5-6 questions: mix MCQ + T/F + FILL_IN.`,
  };

  return `You are an expert English matura exam creator.

LEVEL: ${levelDesc}
${topicHint}
FORMAT: ${patterns[pattern] || patterns.short_dialogue}

RULES:
1. Natural language with contractions/fillers.
2. For dialogues: use [Speaker Name] labels.
3. Correct answers distributed across A/B/C/D.
4. Questions answerable ONLY from recording.

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

RESPOND ONLY WITH JSON (no markdown):
{
  "title": "<title>",
  "listeningType": "<monologue|dialogue|interview|announcement|news_report>",
  "transcript": "<full transcript>",
  "speakers": [{"id":"1","name":"<name>","gender":"female|male"}],
  "contextPL": "<Polish instruction>",
  "question": "<English instruction>",
  "subQuestions": [...],
  "difficulty": <1-5>,
  "estimatedDurationSec": <number>
}`;
}
