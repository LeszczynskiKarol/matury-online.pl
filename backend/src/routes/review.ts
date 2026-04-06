import { FastifyPluginAsync } from 'fastify';
import { getDueCards, processReview, answerToQuality } from '../services/spaced-repetition.js';

export const reviewRoutes: FastifyPluginAsync = async (app) => {

  // Get due review cards
  app.get('/due', {
    preHandler: [app.requirePremium],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          topicId: { type: 'string' },
          limit: { type: 'number', default: 20 },
        },
      },
    },
  }, async (req) => {
    const { topicId, limit } = req.query as any;
    const cards = await getDueCards(app.prisma, req.user.userId, { topicId, limit });

    // Fetch questions for the cards
    const questionIds = cards.map((c) => c.questionId);
    const questions = await app.prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, type: true, content: true, difficulty: true, topic: { select: { name: true } } },
    });

    const questionMap = new Map(questions.map((q) => [q.id, q]));

    return cards.map((card) => ({
      cardId: card.id,
      question: questionMap.get(card.questionId),
      easeFactor: card.easeFactor,
      interval: card.interval,
    }));
  });

  // Submit review result
  app.post('/submit', {
    preHandler: [app.requirePremium],
    schema: {
      body: {
        type: 'object',
        required: ['cardId', 'quality'],
        properties: {
          cardId: { type: 'string' },
          quality: { type: 'number', minimum: 0, maximum: 5 },
        },
      },
    },
  }, async (req) => {
    const { cardId, quality } = req.body as any;
    const result = await processReview(app.prisma, cardId, quality);
    return { nextReviewAt: result.nextReviewAt, interval: result.interval };
  });

  // Get review stats
  app.get('/stats', {
    preHandler: [app.authenticate],
  }, async (req) => {
    const userId = req.user.userId;
    const now = new Date();

    const [dueCount, totalCards, masteredCount] = await Promise.all([
      app.prisma.reviewCard.count({ where: { userId, nextReviewAt: { lte: now } } }),
      app.prisma.reviewCard.count({ where: { userId } }),
      app.prisma.reviewCard.count({ where: { userId, interval: { gte: 30 } } }),
    ]);

    return { dueCount, totalCards, masteredCount };
  });
};
