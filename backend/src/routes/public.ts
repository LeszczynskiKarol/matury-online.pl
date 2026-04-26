// backend/src/routes/public.ts

import { FastifyPluginAsync } from "fastify";

export const publicRoutes: FastifyPluginAsync = async (app) => {
  // Question counts per subject + total (no auth, cached)
  app.get("/question-counts", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300"); // 5 min cache

    const subjects = await app.prisma.subject.findMany({
      where: { isActive: true },
      select: {
        slug: true,
        _count: { select: { questions: { where: { isActive: true } } } },
      },
    });

    const bySubject: Record<string, number> = {};
    let total = 0;
    for (const s of subjects) {
      bySubject[s.slug] = s._count.questions;
      total += s._count.questions;
    }

    return { total, bySubject };
  });
};
