// ============================================================================
// AI Credits Service — check balance, gate AI features, reset monthly
// backend/src/services/ai-credits.ts
//
// 1 credit = $0.01 USD
// Premium users get 600 credits/month (~$6)
// Credits deducted automatically in claude-monitor.ts after each call
// ============================================================================

import { PrismaClient } from "@prisma/client";

const MONTHLY_CREDITS = 600; // $6 worth

// ── Check if user can use AI features ────────────────────────────────────

export async function checkAiCredits(
  prisma: PrismaClient,
  userId: string,
): Promise<{ allowed: boolean; remaining: number; total: number }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      aiCreditsRemaining: true,
      subscriptionStatus: true,
      subscriptionEnd: true,
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

  if (!isPremium) {
    return { allowed: false, remaining: 0, total: 0 };
  }

  return {
    allowed: user.aiCreditsRemaining > 0,
    remaining: user.aiCreditsRemaining,
    total: MONTHLY_CREDITS,
  };
}

// ── Require credits — throws if not enough ───────────────────────────────

export async function requireAiCredits(
  prisma: PrismaClient,
  userId: string,
  estimatedCredits: number = 1,
): Promise<void> {
  const { allowed, remaining } = await checkAiCredits(prisma, userId);

  if (!allowed) {
    const err: any = new Error(
      remaining <= 0
        ? "Wykorzystano pulę kredytów AI w tym miesiącu. Pula odnowi się z nowym okresem rozliczeniowym."
        : "Dostęp do funkcji AI wymaga aktywnej subskrypcji Premium.",
    );
    err.statusCode = 403;
    err.code = remaining <= 0 ? "AI_CREDITS_EXHAUSTED" : "PREMIUM_REQUIRED";
    err.remaining = remaining;
    throw err;
  }
}

// ── Reset credits (called from Stripe webhook on renewal) ────────────────

export async function resetAiCredits(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      aiCreditsRemaining: MONTHLY_CREDITS,
      aiCreditsResetAt: new Date(),
    },
  });
}

// ── Grant credits on first subscription ──────────────────────────────────

export async function grantInitialCredits(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { aiCreditsRemaining: true, aiCreditsResetAt: true },
  });

  // Only grant if never had credits before (fresh subscription)
  if (!user.aiCreditsResetAt) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        aiCreditsRemaining: MONTHLY_CREDITS,
        aiCreditsResetAt: new Date(),
      },
    });
  }
}

export { MONTHLY_CREDITS };
