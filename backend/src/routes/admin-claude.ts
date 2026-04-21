// ============================================================================
// Admin Claude Monitor Routes
// backend/src/routes/admin-claude.ts
//
// GET /admin/claude/logs     — paginated logs with filters
// GET /admin/claude/stats    — aggregated costs, usage stats
//
// Register in app.ts:
//   import { adminClaudeRoutes } from './routes/admin-claude.js';
//   await app.register(adminClaudeRoutes, { prefix: '/api/admin' });
// ============================================================================

import { FastifyPluginAsync } from "fastify";
import { setMonitorPrisma } from "../services/claude-monitor.js";

export const adminClaudeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.requireAdmin);

  // Inject prisma into monitor
  setMonitorPrisma(app.prisma);

  // ── LOGS — paginated, filterable ───────────────────────────────────
  app.get("/claude/logs", async (req) => {
    const {
      caller,
      userId,
      success,
      limit = 50,
      offset = 0,
      from,
      to,
    } = req.query as any;

    const where: any = {};
    if (caller) where.caller = caller;
    if (userId) where.userId = userId;
    if (success !== undefined) where.success = success === "true";
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      app.prisma.claudeApiLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
        select: {
          id: true,
          caller: true,
          model: true,
          userId: true,
          questionId: true,
          inputTokens: true,
          outputTokens: true,
          costUsd: true,
          durationMs: true,
          success: true,
          error: true,
          createdAt: true,
          // Truncated prompts for list view
          userPrompt: false,
          rawResponse: false,
        },
      }),
      app.prisma.claudeApiLog.count({ where }),
    ]);

    return { logs, total };
  });

  // ── SINGLE LOG — full detail ───────────────────────────────────────
  app.get("/claude/logs/:id", async (req, reply) => {
    const log = await app.prisma.claudeApiLog.findUnique({
      where: { id: (req.params as any).id },
    });
    if (!log) return reply.code(404).send({ error: "Not found" });
    return log;
  });

  // ── STATS — aggregated costs, usage ────────────────────────────────
  app.get("/claude/stats", async (req) => {
    const { days = 30 } = req.query as any;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const [
      totalLogs,
      totalCost,
      totalTokens,
      callerBreakdown,
      dailyCosts,
      recentErrors,
      modelBreakdown,
    ] = await Promise.all([
      // Total count
      app.prisma.claudeApiLog.count({ where: { createdAt: { gte: since } } }),

      // Total cost
      app.prisma.claudeApiLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { costUsd: true },
      }),

      // Total tokens
      app.prisma.claudeApiLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true },
      }),

      // Per-caller breakdown
      app.prisma.$queryRaw`
        SELECT caller,
               COUNT(*)::int as count,
               SUM("costUsd")::float as "totalCost",
               SUM("inputTokens")::int as "totalInput",
               SUM("outputTokens")::int as "totalOutput",
               AVG("durationMs")::int as "avgDuration",
               COUNT(*) FILTER (WHERE success = false)::int as errors
        FROM "ClaudeApiLog"
        WHERE "createdAt" >= ${since}
        GROUP BY caller
        ORDER BY "totalCost" DESC
      ` as Promise<any[]>,

      // Daily cost trend
      app.prisma.$queryRaw`
        SELECT DATE("createdAt") as date,
               COUNT(*)::int as count,
               SUM("costUsd")::float as cost,
               SUM("inputTokens")::int as "inputTokens",
               SUM("outputTokens")::int as "outputTokens"
        FROM "ClaudeApiLog"
        WHERE "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
        LIMIT 30
      ` as Promise<any[]>,

      // Recent errors
      app.prisma.claudeApiLog.findMany({
        where: { success: false, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          caller: true,
          error: true,
          createdAt: true,
          model: true,
        },
      }),

      // Per-model breakdown
      app.prisma.$queryRaw`
        SELECT model,
               COUNT(*)::int as count,
               SUM("costUsd")::float as "totalCost",
               AVG("durationMs")::int as "avgDuration"
        FROM "ClaudeApiLog"
        WHERE "createdAt" >= ${since}
        GROUP BY model
        ORDER BY "totalCost" DESC
      ` as Promise<any[]>,
    ]);

    return {
      period: { days: parseInt(days as string), since: since.toISOString() },
      totals: {
        requests: totalLogs,
        costUsd: totalCost._sum.costUsd || 0,
        inputTokens: totalTokens._sum.inputTokens || 0,
        outputTokens: totalTokens._sum.outputTokens || 0,
      },
      callerBreakdown,
      modelBreakdown,
      dailyCosts: dailyCosts.reverse(),
      recentErrors,
    };
  });
};
