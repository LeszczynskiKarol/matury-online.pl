// ============================================================================
// Admin Explanation Generator Routes
// backend/src/routes/admin-explanations.ts
//
// GET  /admin/explanations/stats          — missing explanation stats
// GET  /admin/explanations/missing        — paginated list of questions w/o explanation
// GET  /admin/explanations/preview/:id    — preview prompt that would be sent to Claude
// POST /admin/explanations/generate/:id   — generate for single question
// POST /admin/explanations/batch          — generate for array of question IDs
// POST /admin/explanations/batch-filter   — generate for all matching a filter
//
// Register in app.ts:
//   import { adminExplanationRoutes } from './routes/admin-explanations.js';
//   await app.register(adminExplanationRoutes, { prefix: '/api/admin' });
// ============================================================================

import { FastifyPluginAsync } from "fastify";
import {
  getMissingExplanationStats,
  getQuestionsMissingExplanation,
  generateExplanation,
  generateExplanationsBatch,
} from "../services/explanation-generator.js";

export const adminExplanationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.requireAdmin);

  // ── Stats — how many are missing, by subject/type/topic ────────────
  app.get(
    "/explanations/stats",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            subjectId: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { subjectId } = req.query as any;
      return getMissingExplanationStats(app.prisma, subjectId);
    },
  );

  // ── List questions missing explanation ──────────────────────────────
  app.get(
    "/explanations/missing",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            subjectId: { type: "string" },
            topicId: { type: "string" },
            type: { type: "string" },
            limit: { type: "number", default: 20 },
            offset: { type: "number", default: 0 },
          },
        },
      },
    },
    async (req) => {
      const { subjectId, topicId, type, limit, offset } = req.query as any;
      return getQuestionsMissingExplanation(app.prisma, {
        subjectId,
        topicId,
        type,
        limit,
        offset,
      });
    },
  );

  // ── Preview — show the prompt without calling Claude ───────────────
  app.get("/explanations/preview/:id", async (req, reply) => {
    const { id } = req.params as any;
    const result = await generateExplanation(app.prisma, id, { dryRun: true });
    if (!result.success) {
      return reply.code(404).send({ error: result.error });
    }

    // Also return the question data for display
    const question = await app.prisma.question.findUnique({
      where: { id },
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
        subject: { select: { slug: true, name: true } },
      },
    });

    return { question, promptPreview: result.explanation };
  });

  // ── Generate single ────────────────────────────────────────────────
  app.post(
    "/explanations/generate/:id",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { id } = req.params as any;
      const { model } = (req.body as any) || {};
      return generateExplanation(app.prisma, id, { model });
    },
  );

  // ── In-memory job tracker ─────────────────────────────────────────
  const batchJobs = new Map<
    string,
    {
      status: "running" | "done" | "error";
      total: number;
      processed: number;
      succeeded: number;
      failed: number;
      totalCostUsd: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      results: any[];
      startedAt: string;
      finishedAt?: string;
      error?: string;
    }
  >();

  // ── Batch — explicit question IDs (fire-and-forget) ────────────────
  app.post(
    "/explanations/batch",
    {
      schema: {
        body: {
          type: "object",
          required: ["questionIds"],
          properties: {
            questionIds: {
              type: "array",
              items: { type: "string" },
              maxItems: 100,
            },
            model: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { questionIds, model } = req.body as any;
      const jobId = `batch_${Date.now()}`;

      batchJobs.set(jobId, {
        status: "running",
        total: questionIds.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        results: [],
        startedAt: new Date().toISOString(),
      });

      // Fire and forget — don't await
      runBatchInBackground(app.prisma, jobId, questionIds, model, batchJobs);

      return { jobId, total: questionIds.length, status: "running" };
    },
  );

  // ── Batch by filter (fire-and-forget) ──────────────────────────────
  app.post(
    "/explanations/batch-filter",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            subjectId: { type: "string" },
            topicId: { type: "string" },
            type: { type: "string" },
            limit: { type: "number", default: 20, maximum: 100 },
            model: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { subjectId, topicId, type, limit = 20, model } = req.body as any;

      const { questions } = await getQuestionsMissingExplanation(app.prisma, {
        subjectId,
        topicId,
        type,
        limit,
        offset: 0,
      });

      if (questions.length === 0) {
        return {
          jobId: null,
          total: 0,
          status: "done",
          succeeded: 0,
          failed: 0,
          totalCostUsd: 0,
          results: [],
        };
      }

      const ids = questions.map((q: any) => q.id);
      const jobId = `batch_${Date.now()}`;

      batchJobs.set(jobId, {
        status: "running",
        total: ids.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        results: [],
        startedAt: new Date().toISOString(),
      });

      // Fire and forget
      runBatchInBackground(app.prisma, jobId, ids, model, batchJobs);

      return { jobId, total: ids.length, status: "running" };
    },
  );

  // ── Poll batch progress ────────────────────────────────────────────
  app.get("/explanations/batch/:jobId", async (req, reply) => {
    const { jobId } = req.params as any;
    const job = batchJobs.get(jobId);
    if (!job) return reply.code(404).send({ error: "Job not found" });
    return { jobId, ...job };
  });

  // ── Manual edit — admin writes/overwrites explanation ───────────────
  app.put(
    "/explanations/:id",
    {
      schema: {
        body: {
          type: "object",
          required: ["explanation"],
          properties: {
            explanation: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as any;
      const { explanation } = req.body as any;

      const q = await app.prisma.question.findUnique({ where: { id } });
      if (!q) return reply.code(404).send({ error: "Not found" });

      await app.prisma.question.update({
        where: { id },
        data: { explanation },
      });

      return { ok: true, questionId: id };
    },
  );
};

// ── Background batch runner (outside plugin scope) ───────────────────────────

async function runBatchInBackground(
  prisma: any,
  jobId: string,
  questionIds: string[],
  model: string | undefined,
  jobs: Map<string, any>,
) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    for (const qId of questionIds) {
      try {
        const result = await generateExplanation(prisma, qId, { model });

        job.processed++;
        if (result.success) {
          job.succeeded++;
        } else {
          job.failed++;
        }
        job.totalCostUsd += result.costUsd;
        job.totalInputTokens += result.inputTokens;
        job.totalOutputTokens += result.outputTokens;
        job.results.push(result);
      } catch (e: any) {
        job.processed++;
        job.failed++;
        job.results.push({
          questionId: qId,
          success: false,
          error: e.message,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        });
      }

      // 500ms delay between calls
      if (job.processed < job.total) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    job.status = "done";
    job.finishedAt = new Date().toISOString();

    // Clean up old jobs after 10 minutes
    setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
  } catch (e: any) {
    job.status = "error";
    job.error = e.message;
    job.finishedAt = new Date().toISOString();
  }
}
