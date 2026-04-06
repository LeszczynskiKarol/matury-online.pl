import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePremium: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; role: string };
    user: { userId: string; role: string };
  }
}

const authPlugin: FastifyPluginAsync = async (app) => {

  // ── Basic auth — user must be logged in ──────────────────────────────────
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ── Optional auth — populates user if token present ──────────────────────
  app.decorate('optionalAuth', async (req: FastifyRequest, _reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      // no-op — user stays undefined
    }
  });

  // ── Premium guard — active subscription or valid one-time ────────────────
  app.decorate('requirePremium', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const user = await app.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { subscriptionStatus: true, subscriptionEnd: true },
    });

    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }

    const isPremium =
      (user.subscriptionStatus === 'ACTIVE') ||
      (user.subscriptionStatus === 'ONE_TIME' && user.subscriptionEnd && user.subscriptionEnd > new Date());

    if (!isPremium) {
      return reply.code(403).send({
        error: 'Premium required',
        code: 'PREMIUM_REQUIRED',
      });
    }
  });

  // ── Admin guard ──────────────────────────────────────────────────────────
  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (req.user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Admin only' });
    }
  });
};

export default fp(authPlugin, { name: 'auth', dependencies: ['prisma'] });
export { authPlugin };
