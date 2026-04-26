// ============================================================================
// backend/src/routes/reports.ts — Zgłoszenia błędów w pytaniach
// FIXED: SSE CORS + proper streaming headers
// ============================================================================

import { FastifyPluginAsync } from "fastify";
import { reportSSE } from "../services/report-sse.js";

const CATEGORY_LABELS: Record<string, string> = {
  WRONG_ANSWER: "Błędna odpowiedź",
  CONTENT_ERROR: "Błąd w treści",
  UNCLEAR: "Niejasne sformułowanie",
  MISSING_CONTENT: "Brakujące dane",
  DISPLAY_BUG: "Problem z wyświetlaniem",
  OTHER: "Inne",
};

export const reportRoutes: FastifyPluginAsync = async (app) => {
  // ── Tworzenie zgłoszenia (zalogowany user) ─────────────────────────────
  app.post(
    "/",
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes",
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["questionId", "category", "description"],
          properties: {
            questionId: { type: "string" },
            category: {
              type: "string",
              enum: [
                "WRONG_ANSWER",
                "CONTENT_ERROR",
                "UNCLEAR",
                "MISSING_CONTENT",
                "DISPLAY_BUG",
                "OTHER",
              ],
            },
            description: { type: "string", minLength: 5, maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.userId;
      const { questionId, category, description } = req.body as {
        questionId: string;
        category: string;
        description: string;
      };

      const question = await app.prisma.question.findUnique({
        where: { id: questionId },
        select: {
          id: true,
          type: true,
          content: true,
          topic: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, icon: true } },
        },
      });

      if (!question) {
        return reply.code(404).send({ error: "Pytanie nie znalezione" });
      }

      const existing = await app.prisma.questionReport.findFirst({
        where: { questionId, userId, status: "NEW" },
      });

      if (existing) {
        return reply.code(409).send({
          error: "Już zgłosiłeś problem z tym pytaniem. Czekaj na weryfikację.",
        });
      }

      const report = await app.prisma.questionReport.create({
        data: {
          questionId,
          userId,
          category: category as any,
          description: description.trim(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          question: {
            select: {
              id: true,
              type: true,
              difficulty: true,
              content: true,
              topic: { select: { id: true, name: true } },
              subject: { select: { id: true, name: true, icon: true } },
            },
          },
        },
      });

      // ── Wyślij przez SSE do podłączonych adminów ──
      reportSSE.broadcast({
        type: "new_report",
        report: {
          id: report.id,
          category: report.category,
          categoryLabel: CATEGORY_LABELS[report.category] || report.category,
          description: report.description,
          status: report.status,
          createdAt: report.createdAt.toISOString(),
          user: report.user,
          question: report.question,
        },
      });

      return {
        ok: true,
        reportId: report.id,
        message: "Zgłoszenie wysłane. Dziękujemy za pomoc w ulepszaniu pytań!",
      };
    },
  );

  // ── Lista zgłoszeń użytkownika ─────────────────────────────────────────
  app.get("/my", { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user.userId;
    const reports = await app.prisma.questionReport.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        category: true,
        description: true,
        status: true,
        adminNote: true,
        createdAt: true,
        question: {
          select: {
            id: true,
            type: true,
            content: true,
            topic: { select: { name: true } },
            subject: { select: { name: true, icon: true } },
          },
        },
      },
    });
    return { reports };
  });
};

// ── Admin routes ─────────────────────────────────────────────────────────

export const adminReportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.requireAdmin);

  // Lista wszystkich zgłoszeń
  app.get(
    "/reports",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
            category: { type: "string" },
            limit: { type: "number", default: 50 },
            offset: { type: "number", default: 0 },
          },
        },
      },
    },
    async (req) => {
      const { status, category, limit = 50, offset = 0 } = req.query as any;
      const where: any = {};
      if (status) where.status = status;
      if (category) where.category = category;

      const [reports, total, newCount] = await Promise.all([
        app.prisma.questionReport.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: parseInt(limit),
          skip: parseInt(offset),
          include: {
            user: { select: { id: true, name: true, email: true } },
            question: {
              select: {
                id: true,
                type: true,
                difficulty: true,
                points: true,
                content: true,
                explanation: true,
                source: true,
                isActive: true,
                topic: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, icon: true } },
              },
            },
          },
        }),
        app.prisma.questionReport.count({ where }),
        app.prisma.questionReport.count({ where: { status: "NEW" } }),
      ]);

      return { reports, total, newCount };
    },
  );

  // Zmień status zgłoszenia
  app.put(
    "/reports/:id",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["NEW", "IN_PROGRESS", "RESOLVED", "DISMISSED"],
            },
            adminNote: { type: "string", maxLength: 2000 },
          },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { status, adminNote } = req.body as {
        status?: string;
        adminNote?: string;
      };

      const data: any = {};
      if (status) {
        data.status = status;
        if (status === "RESOLVED" || status === "DISMISSED") {
          data.resolvedAt = new Date();
        }
      }
      if (adminNote !== undefined) data.adminNote = adminNote;

      const report = await app.prisma.questionReport.update({
        where: { id },
        data,
        include: {
          user: { select: { id: true, name: true, email: true } },
          question: {
            select: {
              id: true,
              type: true,
              content: true,
              topic: { select: { name: true } },
              subject: { select: { name: true, icon: true } },
            },
          },
        },
      });

      reportSSE.broadcast({
        type: "report_updated",
        report: {
          id: report.id,
          status: report.status,
          adminNote: report.adminNote,
        },
      });

      return report;
    },
  );

  // Bulk resolve
  app.post("/reports/bulk-resolve", async (req) => {
    const { ids } = req.body as { ids: string[] };
    await app.prisma.questionReport.updateMany({
      where: { id: { in: ids } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    return { ok: true, resolved: ids.length };
  });

  // ══════════════════════════════════════════════════════════════════════
  // SSE Stream — FIXED: no manual CORS (Fastify plugin handles it),
  // proper flush headers for nginx/proxy compatibility
  // ══════════════════════════════════════════════════════════════════════
  app.get("/reports/stream", async (req, reply) => {
    // Hijack PRZED writeHead — Fastify nie dodaje swoich headerów
    reply.hijack();

    const origin = req.headers.origin || "*";

    req.raw.socket.setNoDelay(true);
    req.raw.socket.setKeepAlive(true);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // ── CORS: musi być explicit origin, nie * (bo withCredentials) ──
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      // ── Wyłącz buforowanie w nginx/proxy ──
      "X-Accel-Buffering": "no",
    });

    // Flush initial newline żeby proxy zrozumiał że to stream
    reply.raw.write("\n");

    // Heartbeat co 25s
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);

    // Zarejestruj klienta
    const clientId = reportSSE.addClient(reply.raw);

    // Wyślij aktualny count na start
    const newCount = await app.prisma.questionReport.count({
      where: { status: "NEW" },
    });
    reply.raw.write(`data: ${JSON.stringify({ type: "init", newCount })}\n\n`);

    // Cleanup
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      reportSSE.removeClient(clientId);
    });
    req.raw.on("error", () => {
      clearInterval(heartbeat);
      reportSSE.removeClient(clientId);
    });
  });

  // Stats
  app.get("/reports/stats", async () => {
    const [byStatus, byCategory, total] = await Promise.all([
      app.prisma.questionReport.groupBy({ by: ["status"], _count: true }),
      app.prisma.questionReport.groupBy({ by: ["category"], _count: true }),
      app.prisma.questionReport.count(),
    ]);
    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byCategory: Object.fromEntries(
        byCategory.map((c) => [c.category, c._count]),
      ),
    };
  });
};
