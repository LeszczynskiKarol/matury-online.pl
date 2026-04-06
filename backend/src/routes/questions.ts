import { FastifyPluginAsync } from 'fastify';

export const questionRoutes: FastifyPluginAsync = async (app) => {

  // Get questions by topic (for topic drill)
  app.get('/', {
    preHandler: [app.optionalAuth],
    schema: {
      querystring: {
        type: 'object',
        required: ['subjectId'],
        properties: {
          subjectId: { type: 'string' },
          topicId: { type: 'string' },
          type: { type: 'string' },
          difficulty: { type: 'number' },
          limit: { type: 'number', default: 10 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (req) => {
    const { subjectId, topicId, type, difficulty, limit, offset } = req.query as any;

    return app.prisma.question.findMany({
      where: {
        subjectId,
        isActive: true,
        ...(topicId ? { topicId } : {}),
        ...(type ? { type } : {}),
        ...(difficulty ? { difficulty } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        type: true,
        difficulty: true,
        points: true,
        content: true,
        source: true,
        topic: { select: { id: true, name: true, slug: true } },
        totalAttempts: true,
        correctCount: true,
      },
    });
  });

  // Get single question
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = await app.prisma.question.findUnique({
      where: { id },
      include: { topic: { select: { id: true, name: true, slug: true, parentId: true } } },
    });
    if (!q) return reply.code(404).send({ error: 'Question not found' });
    return q;
  });
};
