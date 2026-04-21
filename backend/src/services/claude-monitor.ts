// ============================================================================
// Claude API Monitor — wraps every Claude call with full logging
// backend/src/services/claude-monitor.ts
//
// Usage: replace direct Anthropic imports in all services:
//   BEFORE: import Anthropic from '@anthropic-ai/sdk';
//           const anthropic = new Anthropic({ apiKey: ... });
//           const response = await anthropic.messages.create({ ... });
//
//   AFTER:  import { claudeCall } from './claude-monitor.js';
//           const response = await claudeCall({ caller: 'listening-generator', ... });
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Singleton prisma for logging (avoid circular deps)
let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

// Allow external prisma injection (from routes that already have app.prisma)
export function setMonitorPrisma(prisma: PrismaClient) {
  _prisma = prisma;
}

// ── Cost calculation ─────────────────────────────────────────────────────

const COSTS_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "claude-opus-4-6": { input: 15, output: 75 },
};

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates =
    COSTS_PER_MILLION[model] || COSTS_PER_MILLION["claude-sonnet-4-6"];
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

// ── Main wrapper ─────────────────────────────────────────────────────────

export interface ClaudeCallParams {
  caller: string; // e.g. "listening-generator", "ai-grading", "essay-grading"
  model?: string;
  maxTokens?: number;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  userId?: string;
  questionId?: string;
  metadata?: Record<string, any>;
}

export interface ClaudeCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  logId: string;
  raw: Anthropic.Messages.Message;
}

export async function claudeCall(
  params: ClaudeCallParams,
): Promise<ClaudeCallResult> {
  const model = params.model || "claude-sonnet-4-6";
  const maxTokens = params.maxTokens || 4096;
  const logId = randomUUID();
  const t0 = Date.now();

  let response: Anthropic.Messages.Message;
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let durationMs = 0;
  let success = true;
  let error: string | undefined;

  try {
    const createParams: any = {
      model,
      max_tokens: maxTokens,
      messages: params.messages,
    };
    if (params.system) createParams.system = params.system;

    response = await anthropic.messages.create(createParams);

    durationMs = Date.now() - t0;
    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    inputTokens = response.usage?.input_tokens || 0;
    outputTokens = response.usage?.output_tokens || 0;
    costUsd = calculateCost(model, inputTokens, outputTokens);
  } catch (e: any) {
    durationMs = Date.now() - t0;
    success = false;
    error = e.message;
    throw e; // re-throw after logging
  } finally {
    // Log async — don't block the response
    const userPrompt = params.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n---\n");

    getPrisma()
      .claudeApiLog.create({
        data: {
          id: logId,
          caller: params.caller,
          model,
          userId: params.userId || null,
          questionId: params.questionId || null,
          systemPrompt: params.system || null,
          userPrompt: userPrompt.slice(0, 50000), // cap at 50k chars
          rawResponse: (text || error || "").slice(0, 50000),
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
          success,
          error: error || null,
          metadata: params.metadata || undefined,
        },
      })
      .catch((err) => console.error("Failed to log Claude call:", err.message));

    // Deduct AI credits from user (1 credit = $0.01)
    if (params.userId && success) {
      const creditsUsed = Math.max(1, Math.ceil(costUsd * 100));
      getPrisma()
        .user.update({
          where: { id: params.userId },
          data: { aiCreditsRemaining: { decrement: creditsUsed } },
        })
        .catch((err) =>
          console.error("Failed to deduct credits:", err.message),
        );
    }
  }

  return {
    text,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs,
    logId,
    raw: response!,
  };
}

// ── Quick helper for simple calls ────────────────────────────────────────

export async function claudeGenerate(
  caller: string,
  prompt: string,
  opts?: {
    model?: string;
    system?: string;
    userId?: string;
    questionId?: string;
    metadata?: Record<string, any>;
  },
): Promise<ClaudeCallResult> {
  return claudeCall({
    caller,
    model: opts?.model,
    system: opts?.system,
    messages: [{ role: "user", content: prompt }],
    userId: opts?.userId,
    questionId: opts?.questionId,
    metadata: opts?.metadata,
  });
}
