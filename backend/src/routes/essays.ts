import { FastifyPluginAsync } from 'fastify';
import { gradeEssay } from '../services/ai-grading.js';
import { calculateXp, awardXp, updateStreak } from '../services/gamification.js';

export const essayRoutes: FastifyPluginAsync = async (app) => {

  // ── Submit essay ─────────────────────────────────────────────────────────
  app.post('/submit', {
    preHandler: [app.requirePremium],
    schema: {
      body: {
        type: 'object',
        required: ['subjectId', 'topicId', 'prompt', 'content'],
        properties: {
          subjectId: { type: 'string' },
          topicId: { type: 'string' },
          prompt: { type: 'string' },
          content: { type: 'string', minLength: 50 },
          timeSpentMs: { type: 'number' },
        },
      },
    },
  }, async (req) => {
    const userId = req.user.userId;
    const { subjectId, topicId, prompt, content, timeSpentMs } = req.body as any;

    const subject = await app.prisma.subject.findUniqueOrThrow({ where: { id: subjectId } });

    // Create submission
    const submission = await app.prisma.essaySubmission.create({
      data: {
        userId,
        subjectId,
        topicId,
        prompt,
        content,
        wordCount: content.split(/\s+/).length,
        timeSpentMs: timeSpentMs || null,
      },
    });

    // Grade with AI
    const evaluation = await gradeEssay({
      subjectSlug: subject.slug,
      prompt,
      content,
    });

    // Update submission with grading
    const updated = await app.prisma.essaySubmission.update({
      where: { id: submission.id },
      data: {
        evaluation: evaluation as any,
        totalScore: evaluation.overallScore,
        gradedAt: new Date(),
      },
    });

    // XP
    const xp = calculateXp({
      questionType: 'ESSAY',
      isCorrect: evaluation.overallScore >= 50,
      score: evaluation.overallScore / 100,
      difficulty: 3,
      currentStreak: 0,
    });

    const [xpResult, streakResult] = await Promise.all([
      awardXp(app.prisma, userId, subjectId, xp),
      updateStreak(app.prisma, userId),
    ]);

    return {
      submissionId: updated.id,
      evaluation,
      xpEarned: xp,
      gamification: {
        totalXp: xpResult.totalXp,
        subjectLevel: xpResult.subjectLevel,
        leveledUp: xpResult.leveledUp,
        streak: streakResult.currentStreak,
      },
    };
  });

  // ── Get user's essay history ─────────────────────────────────────────────
  app.get('/history', {
    preHandler: [app.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' },
          limit: { type: 'number', default: 20 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (req) => {
    const { subjectId, limit, offset } = req.query as any;
    return app.prisma.essaySubmission.findMany({
      where: {
        userId: req.user.userId,
        ...(subjectId ? { subjectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        subjectId: true,
        topicId: true,
        prompt: true,
        totalScore: true,
        wordCount: true,
        gradedAt: true,
        createdAt: true,
      },
    });
  });

  // ── Get single essay with full evaluation ────────────────────────────────
  app.get('/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const essay = await app.prisma.essaySubmission.findUnique({ where: { id } });
    if (!essay || essay.userId !== req.user.userId) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return essay;
  });
};
