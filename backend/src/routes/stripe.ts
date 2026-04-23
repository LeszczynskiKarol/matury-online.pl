// ============================================================================
// Stripe Routes — z obsługą mobile return
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

// ── Mobile return page HTML ────────────────────────────────────────────────
function mobileReturnHtml(status: string) {
  const isSuccess = status === "success";
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSuccess ? "Płatność zakończona" : "Płatność anulowana"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #050514; color: #f4f4f5; padding: 24px; }
    .card { text-align: center; max-width: 360px; }
    .emoji { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 14px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }
    .hint { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 16px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); color: #22c55e; font-size: 13px; font-weight: 600; }
    .hint.cancel { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${isSuccess ? "🎉" : "😕"}</div>
    <h1>${isSuccess ? "Płatność zakończona!" : "Płatność anulowana"}</h1>
    <p>${isSuccess ? "Twoje konto zostało zaktualizowane do Premium. Wróć do aplikacji, aby kontynuować naukę." : "Płatność nie została zrealizowana. Wróć do aplikacji i spróbuj ponownie."}</p>
    <div class="hint ${isSuccess ? "" : "cancel"}">
      ← Zamknij to okno, aby wrócić do aplikacji
    </div>
  </div>
</body>
</html>`;
}

export const stripeRoutes: FastifyPluginAsync = async (app) => {
  // ── Mobile return endpoint ───────────────────────────────────────────────
  app.get("/mobile-return", async (req, reply) => {
    const { status } = req.query as { status?: string };
    reply.type("text/html").send(mobileReturnHtml(status || "success"));
  });

  // ── Status ───────────────────────────────────────────────────────────────
  app.get("/status", { preHandler: [app.authenticate] }, async (req) => {
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
  });

  app.get("/credits", { preHandler: [app.authenticate] }, async (req) => {
    const { checkAiCredits } = await import("../services/ai-credits.js");
    return checkAiCredits(app.prisma, req.user.userId);
  });

  // ── Checkout — supports source: 'mobile' ────────────────────────────────
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
            source: { type: "string" }, // 'mobile' | undefined
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.userId;
      const { plan, source } = req.body as {
        plan: "subscription" | "one_time";
        source?: string;
      };

      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

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

      // ── Determine return URLs based on source ────────────────────────────
      const isMobile = source === "mobile";
      const baseUrl = process.env.FRONTEND_URL!;

      const successUrl = isMobile
        ? `${baseUrl}/api/stripe/mobile-return?status=success`
        : `${baseUrl}/dashboard/subskrypcja?payment=success`;
      const cancelUrl = isMobile
        ? `${baseUrl}/api/stripe/mobile-return?status=cancelled`
        : `${baseUrl}/dashboard/subskrypcja?payment=cancelled`;

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
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { userId, plan },
        locale: "pl",
        allow_promotion_codes: true,
      });

      return { url: session.url };
    },
  );

  // ── Cancel ───────────────────────────────────────────────────────────────
  app.post(
    "/cancel",
    { preHandler: [app.authenticate] },
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

      const sub = await app.stripe.subscriptions.update(
        user.stripeSubscriptionId,
        { cancel_at_period_end: true },
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

  // ── Resume ───────────────────────────────────────────────────────────────
  app.post(
    "/resume",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: req.user.userId },
        select: {
          stripeSubscriptionId: true,
          subscriptionStatus: true,
          subscriptionEnd: true,
        },
      });

      if (!user.stripeSubscriptionId)
        return reply.code(400).send({ error: "Brak subskrypcji" });

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

  // ── Buy credits ──────────────────────────────────────────────────────────
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
            source: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.userId;
      const { package: pkg, source } = req.body as {
        package: string;
        source?: string;
      };

      const pack = CREDIT_PACKAGES[pkg];
      if (!pack) return reply.code(400).send({ error: "Invalid package" });

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

      if (!isPremium)
        return reply
          .code(403)
          .send({
            error: "Kredyty AI dostępne tylko dla użytkowników Premium.",
          });

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

      const isMobile = source === "mobile";
      const baseUrl = process.env.FRONTEND_URL!;

      const session = await app.stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        payment_method_types: ["card", "revolut_pay", "blik"],
        line_items: [{ price: pack.priceId, quantity: 1 }],
        success_url: isMobile
          ? `${baseUrl}/api/stripe/mobile-return?status=success`
          : `${baseUrl}/dashboard/subskrypcja?credits=success&package=${pkg}`,
        cancel_url: isMobile
          ? `${baseUrl}/api/stripe/mobile-return?status=cancelled`
          : `${baseUrl}/dashboard/subskrypcja?credits=cancelled`,
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

  // ── Portal ───────────────────────────────────────────────────────────────
  app.post(
    "/portal",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: req.user.userId },
        select: { stripeCustomerId: true },
      });
      if (!user.stripeCustomerId)
        return reply.code(400).send({ error: "No subscription found" });

      const session = await app.stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${process.env.FRONTEND_URL}/dashboard/subskrypcja`,
      });
      return { url: session.url };
    },
  );

  // ── Webhook ──────────────────────────────────────────────────────────────
  app.post("/webhook", { config: { rawBody: true } }, async (req, reply) => {
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
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
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

        const users = await app.prisma.user.findMany({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        });
        const { resetAiCredits } = await import("../services/ai-credits.js");
        for (const u of users) await resetAiCredits(app.prisma, u.id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await app.prisma.user.updateMany({
          where: { stripeCustomerId: sub.customer as string },
          data: { subscriptionStatus: "EXPIRED", stripeSubscriptionId: null },
        });
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.payment_status === "paid") {
          const userId = session.metadata?.userId;
          if (!userId) break;

          if (session.metadata?.type === "credits") {
            const credits = parseInt(session.metadata.credits || "0");
            if (credits > 0) {
              await app.prisma.user.update({
                where: { id: userId },
                data: { aiCreditsRemaining: { increment: credits } },
              });
              app.log.info(`💰 Added ${credits} AI credits to user ${userId}`);
            }
            break;
          }

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
            data: { subscriptionStatus: "ONE_TIME", subscriptionEnd: endDate },
          });
          const { grantInitialCredits } =
            await import("../services/ai-credits.js");
          await grantInitialCredits(app.prisma, userId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await app.prisma.user.updateMany({
          where: { stripeCustomerId: invoice.customer as string },
          data: { subscriptionStatus: "PAST_DUE" },
        });
        break;
      }
    }

    return { received: true };
  });
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
