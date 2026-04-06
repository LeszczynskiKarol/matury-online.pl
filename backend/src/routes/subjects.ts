import { FastifyPluginAsync } from 'fastify';

export const subjectRoutes: FastifyPluginAsync = async (app) => {

  // List all active subjects
  app.get('/', async () => {
    return app.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { questions: { where: { isActive: true } } } },
        topics: {
          where: { depth: 0, isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, slug: true, name: true, questionCount: true, dateFrom: true, dateTo: true },
        },
      },
    });
  });

  // Get subject detail with full topic tree
  app.get('/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const subject = await app.prisma.subject.findUnique({
      where: { slug },
      include: {
        topics: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, slug: true, name: true, author: true, questionCount: true },
            },
          },
        },
      },
    });
    if (!subject) return reply.code(404).send({ error: 'Subject not found' });
    return subject;
  });

  // Get user progress for a subject (authenticated)
  app.get('/:slug/progress', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const subject = await app.prisma.subject.findUnique({ where: { slug } });
    if (!subject) return reply.code(404).send({ error: 'Subject not found' });

    const progress = await app.prisma.subjectProgress.findUnique({
      where: { userId_subjectId: { userId: req.user.userId, subjectId: subject.id } },
    });

    const recentAnswers = await app.prisma.answer.findMany({
      where: { userId: req.user.userId, question: { subjectId: subject.id } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        isCorrect: true,
        score: true,
        createdAt: true,
        question: { select: { topicId: true, type: true, difficulty: true } },
      },
    });

    return { progress, recentAnswers };
  });

  // Select subjects (up to 4, premium)
  app.post('/select', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['subjectIds'],
        properties: {
          subjectIds: { type: 'array', items: { type: 'string' }, maxItems: 4 },
        },
      },
    },
  }, async (req) => {
    const userId = req.user.userId;
    const { subjectIds } = req.body as { subjectIds: string[] };

    // Remove old selections, add new
    await app.prisma.userSubject.deleteMany({ where: { userId } });
    await app.prisma.userSubject.createMany({
      data: subjectIds.map((subjectId) => ({ userId, subjectId })),
    });

    return { selected: subjectIds.length };
  });
};
