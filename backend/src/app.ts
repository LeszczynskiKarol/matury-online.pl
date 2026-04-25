// ============================================================================
// MATURY-ONLINE.PL — Fastify Backend Entry
// ============================================================================

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { prismaPlugin } from "./plugins/prisma.js";
import { stripePlugin } from "./plugins/stripe.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { subjectRoutes } from "./routes/subjects.js";
import { questionRoutes } from "./routes/questions.js";
import { sessionRoutes } from "./routes/sessions.js";
import { answerRoutes } from "./routes/answers.js";
import { listeningRoutes } from "./routes/listening.js";
import { essayRoutes } from "./routes/essays.js";
import { reviewRoutes } from "./routes/review.js";
import { gamificationRoutes } from "./routes/gamification.js";
import { stripeRoutes } from "./routes/stripe.js";
import { adminRoutes } from "./routes/admin.js";
import { contactRoutes } from "./routes/contact.js";
import { adminListeningRoutes } from "./routes/admin-listening.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { adminClaudeRoutes } from "./routes/admin-claude.js";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (req, body, done) => {
    (req as any).rawBody = body;
    try {
      const str = body.toString();
      done(null, str.length > 0 ? JSON.parse(str) : {});
    } catch (err: any) {
      done(err);
    }
  },
);

// ── Plugins ──────────────────────────────────────────────────────────────────

if (process.env.ENABLE_CORS !== "false") {
  const cors = await import("@fastify/cors");
  await app.register(cors.default, {
    origin: true,
    credentials: true,
  });
}

await app.register(cookie, {
  secret: process.env.COOKIE_SECRET,
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET!,
  sign: { expiresIn: "7d" },
  cookie: { cookieName: "token", signed: false },
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// Custom plugins
await app.register(prismaPlugin);
await app.register(stripePlugin);
await app.register(authPlugin);

// ── Routes ───────────────────────────────────────────────────────────────────

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(subjectRoutes, { prefix: "/api/subjects" });
await app.register(questionRoutes, { prefix: "/api/questions" });
await app.register(sessionRoutes, { prefix: "/api/sessions" });
await app.register(answerRoutes, { prefix: "/api/answers" });
await app.register(essayRoutes, { prefix: "/api/essays" });
await app.register(reviewRoutes, { prefix: "/api/review" });
await app.register(gamificationRoutes, { prefix: "/api/gamification" });
await app.register(stripeRoutes, { prefix: "/api/stripe" });
await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
await app.register(adminRoutes, { prefix: "/api/admin" });
await app.register(adminListeningRoutes, { prefix: "/api/admin" });
await app.register(adminClaudeRoutes, { prefix: "/api/admin" });
await app.register(listeningRoutes, { prefix: "/api/listening" });
await app.register(contactRoutes, { prefix: "/api/contact" });

// ── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001");
const HOST = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`🚀 matury-online backend running on ${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export default app;
