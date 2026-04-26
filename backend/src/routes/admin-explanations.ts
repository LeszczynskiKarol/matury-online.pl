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

  // ── Batch — explicit question IDs ──────────────────────────────────
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
      return generateExplanationsBatch(app.prisma, questionIds, { model });
    },
  );

  // ── Batch by filter — find + generate in one call ──────────────────
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
          total: 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          totalCostUsd: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          results: [],
        };
      }

      const ids = questions.map((q: any) => q.id);
      return generateExplanationsBatch(app.prisma, ids, { model });
    },
  );

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
