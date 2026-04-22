// ============================================================================
// Stripe Routes — Subscriptions (49 PLN/mo) & One-time (59 PLN / 30 days)
// + Cancellation/resume + daily limit check
// ============================================================================

import { FastifyPluginAsync } from "fastify";
import Stripe from "stripe";

const PRICES = {
  SUBSCRIPTION: process.env.STRIPE_PRICE_SUBSCRIPTION!,
  ONE_TIME: process.env.STRIPE_PRICE_ONE_TIME!,
  CREDITS_200: process.env.STRIPE_PRICE_CREDITS_200!,
  CREDITS_500: process.env.STRIPE_PRICE_CREDITS_500!,
  CREDITS_1200: process.env.STRIPE_PRICE_CREDITS_1200!,
};

const CREDIT_PACKAGES: Record<string, { priceId: string; credits: number }> = {
  credits_200: { priceId: PRICES.CREDITS_200, credits: 200 },
  credits_500: { priceId: PRICES.CREDITS_500, credits: 500 },
  credits_1200: { priceId: PRICES.CREDITS_1200, credits: 1200 },
};

export const stripeRoutes: FastifyPluginAsync = async (app) => {
  // ── Check if user has premium access ─────────────────────────────────────
  app.get(
    "/status",
    {
      preHandler: [app.authenticate],
    },
    async (req) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: req.user.userId },
        select: {
          subscriptionStatus: true,
          subscriptionEnd: true,
          stripeSubscriptionId: true,
        },
      });

      const now = new Date();
      const isPremium =
        user.subscriptionStatus === "ACTIVE" ||
        (user.subscriptionStatus === "ONE_TIME" &&
          user.subscriptionEnd &&
          user.subscriptionEnd > now) ||
        (user.subscriptionStatus === "CANCELLED" &&
          user.subscriptionEnd &&
          user.subscriptionEnd > now);

      // Daily question count for free users
      return {
        isPremium,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEnd: user.subscriptionEnd,
        willExpire:
          user.subscriptionStatus === "CANCELLED" && user.subscriptionEnd
            ? user.subscriptionEnd.toISOString()
            : null,
        canResume:
          user.subscriptionStatus === "CANCELLED" &&
          user.subscriptionEnd &&
          user.subscriptionEnd > now,
        canCancel:
          user.subscriptionStatus === "ACTIVE" && !!user.stripeSubscriptionId,
      };
    },
  );

  app.get("/credits", { preHandler: [app.authenticate] }, async (req) => {
    const { checkAiCredits } = await import("../services/ai-credits.js");
    return checkAiCredits(app.prisma, req.user.userId);
  });

  // ── Create checkout session ──────────────────────────────────────────────
  app.post(
    "/checkout",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["plan"],
          properties: {
            plan: { type: "string", enum: ["subscription", "one_time"] },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.userId;
      const { plan } = req.body as { plan: "subscription" | "one_time" };

      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await app.stripe.customers.create({
          email: user.email,
          metadata: { userId },
        });
        customerId = customer.id;
        await app.prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: customerId },
        });
      }

      const isSubscription = plan === "subscription";

      // Prevent duplicate subscriptions
      if (plan === "subscription" && user.stripeSubscriptionId) {
        const existingSub = await app.stripe.subscriptions
          .retrieve(user.stripeSubscriptionId)
          .catch(() => null);
        if (
          existingSub &&
          ["active", "past_due", "trialing"].includes(existingSub.status)
        ) {
          return reply
            .code(400)
            .send({ error: "Masz już aktywną subskrypcję" });
        }
      }

      const session = await app.stripe.checkout.sessions.create({
        customer: customerId,
        mode: isSubscription ? "subscription" : "payment",
        payment_method_types: isSubscription
          ? ["card", "revolut_pay"]
          : ["card", "revolut_pay", "blik"],
        line_items: [
          {
            price: isSubscription ? PRICES.SUBSCRIPTION : PRICES.ONE_TIME,
            quantity: 1,
          },
        ],
        success_url: `${process.env.FRONTEND_URL}/dashboard/subskrypcja?payment=success`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard/subskrypcja?payment=cancelled`,
        metadata: { userId, plan },
        locale: "pl",
        allow_promotion_codes: true,
      });

      return { url: session.url };
    },
  );

  // ── Cancel subscription (at period end — fair to customer) ───────────────
  app.post(
    "/cancel",
    {
      preHandler: [app.authenticate],
    },
    async (req, reply) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: req.user.userId },
        select: { stripeSubscriptionId: true, subscriptionStatus: true },
      });

      if (!user.stripeSubscriptionId || user.subscriptionStatus !== "ACTIVE") {
        return reply
          .code(400)
          .send({ error: "Brak aktywnej subskrypcji do anulowania" });
      }

      // Cancel at period end — user keeps access until end of paid period
      const sub = await app.stripe.subscriptions.update(
        user.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        },
      );

      await app.prisma.user.update({
        where: { id: req.user.userId },
        data: {
          subscriptionStatus: "CANCELLED",
          subscriptionEnd: new Date(sub.current_period_end * 1000),
        },
      });

      return {
        message:
          "Subskrypcja anulowana. Dostęp Premium do końca opłaconego okresu.",
        accessUntil: new Date(sub.current_period_end * 1000).toISOString(),
      };
    },
  );

  // ── Resume cancelled subscription (before period end) ────────────────────
  app.post(
    "/resume",
    {
      preHandler: [app.authenticate],
    },
    async (req, reply) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: req.user.userId },
        select: {
          stripeSubscriptionId: true,
          subscriptionStatus: true,
          subscriptionEnd: true,
        },
      });

      if (!user.stripeSubscriptionId) {
        return reply.code(400).send({ error: "Brak subskrypcji" });
      }

      const now = new Date();
      if (
        user.subscriptionStatus !== "CANCELLED" ||
        !user.subscriptionEnd ||
        user.subscriptionEnd <= now
      ) {
        return reply
          .code(400)
          .send({ error: "Subskrypcja nie może zostać wznowiona" });
      }

      // Remove cancel_at_period_end — reactivates the subscription
      await app.stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      await app.prisma.user.update({
        where: { id: req.user.userId },
        data: { subscriptionStatus: "ACTIVE" },
      });

      return { message: "Subskrypcja wznowiona!" };
    },
  );

  // ── Buy AI credits ───────────────────────────────────────────────────────
  app.post(
    "/buy-credits",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["package"],
          properties: {
            package: {
              type: "string",
              enum: ["credits_200", "credits_500", "credits_1200"],
            },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.userId;
      const { package: pkg } = req.body as { package: string };

      const pack = CREDIT_PACKAGES[pkg];
      if (!pack) return reply.code(400).send({ error: "Invalid package" });

      // Must be premium to buy credits
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      const now = new Date();
      const isPremium =
        user.subscriptionStatus === "ACTIVE" ||
        (user.subscriptionStatus === "ONE_TIME" &&
          user.subscriptionEnd &&
          user.subscriptionEnd > now) ||
        (user.subscriptionStatus === "CANCELLED" &&
          user.subscriptionEnd &&
          user.subscriptionEnd > now);

      if (!isPremium) {
        return reply.code(403).send({
          error: "Kredyty AI dostępne tylko dla użytkowników Premium.",
        });
      }

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await app.stripe.customers.create({
          email: user.email,
          metadata: { userId },
        });
        customerId = customer.id;
        await app.prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: customerId },
        });
      }

      const session = await app.stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        payment_method_types: ["card", "revolut_pay", "blik"],
        line_items: [{ price: pack.priceId, quantity: 1 }],
        success_url: `${process.env.FRONTEND_URL}/dashboard/subskrypcja?credits=success&package=${pkg}`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard/subskrypcja?credits=cancelled`,
        metadata: {
          userId,
          type: "credits",
          package: pkg,
          credits: String(pack.credits),
        },
        locale: "pl",
      });

      return { url: session.url };
    },
  );

  // ── Customer portal (manage payment methods etc.) ────────────────────────
  app.post(
    "/portal",
    {
      preHandler: [app.authenticate],
    },
    async (req, reply) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: req.user.userId },
        select: { stripeCustomerId: true },
      });

      if (!user.stripeCustomerId) {
        return reply.code(400).send({ error: "No subscription found" });
      }

      const session = await app.stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${process.env.FRONTEND_URL}/dashboard/subskrypcja`,
      });

      return { url: session.url };
    },
  );

  // ── Stripe Webhook ───────────────────────────────────────────────────────
  app.post(
    "/webhook",
    {
      config: {
        rawBody: true,
      },
    },
    async (req, reply) => {
      const sig = req.headers["stripe-signature"] as string;
      let event: Stripe.Event;

      try {
        event = app.stripe.webhooks.constructEvent(
          (req as any).rawBody,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET!,
        );
      } catch (err: any) {
        app.log.error(`Webhook signature verification failed: ${err.message}`);
        return reply.code(400).send({ error: "Invalid signature" });
      }

      app.log.info(`Stripe webhook: ${event.type}`);

      switch (event.type) {
        // ── Subscription created/updated ─────────────────────────────────
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;

          // If cancel_at_period_end is true, mark as CANCELLED but keep subscriptionEnd
          const status = sub.cancel_at_period_end
            ? ("CANCELLED" as const)
            : mapSubscriptionStatus(sub.status);

          await app.prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              stripeSubscriptionId: sub.id,
              subscriptionStatus: status,
              subscriptionEnd: new Date(
                ((sub as any).current_period_end ??
                  (sub.items?.data?.[0] as any)?.current_period_end ??
                  Math.floor(Date.now() / 1000) + 30 * 86400) * 1000,
              ),
            },
          });

          // Reset AI credits on subscription renewal
          const users = await app.prisma.user.findMany({
            where: { stripeCustomerId: customerId },
            select: { id: true },
          });
          const { resetAiCredits } = await import("../services/ai-credits.js");
          for (const u of users) {
            await resetAiCredits(app.prisma, u.id);
          }

          break;
        }

        // ── Subscription deleted (period ended after cancellation) ───────
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;

          await app.prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionStatus: "EXPIRED",
              stripeSubscriptionId: null,
            },
          });
          break;
        }

        // ── One-time payment succeeded ───────────────────────────────────
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode === "payment" && session.payment_status === "paid") {
            const userId = session.metadata?.userId;
            if (!userId) break;

            // Credit package purchase
            if (session.metadata?.type === "credits") {
              const credits = parseInt(session.metadata.credits || "0");
              if (credits > 0) {
                await app.prisma.user.update({
                  where: { id: userId },
                  data: { aiCreditsRemaining: { increment: credits } },
                });
                app.log.info(
                  `💰 Added ${credits} AI credits to user ${userId}`,
                );
              }
              break;
            }

            // One-time subscription purchase (existing logic)
            const user = await app.prisma.user.findUnique({
              where: { id: userId },
            });
            const now = new Date();
            const currentEnd =
              user?.subscriptionEnd && user.subscriptionEnd > now
                ? user.subscriptionEnd
                : now;
            const endDate = new Date(currentEnd);
            endDate.setDate(endDate.getDate() + 30);

            await app.prisma.user.update({
              where: { id: userId },
              data: {
                subscriptionStatus: "ONE_TIME",
                subscriptionEnd: endDate,
              },
            });

            const { grantInitialCredits } =
              await import("../services/ai-credits.js");
            await grantInitialCredits(app.prisma, userId);
          }
          break;
        }

        // ── Invoice payment failed ───────────────────────────────────────
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          await app.prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "PAST_DUE" },
          });
          break;
        }
      }

      return { received: true };
    },
  );
};

function mapSubscriptionStatus(
  stripeStatus: string,
): "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "unpaid":
      return "CANCELLED";
    default:
      return "EXPIRED";
  }
}
