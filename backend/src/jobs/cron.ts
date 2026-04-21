// ============================================================================
// Scheduled Jobs — run via PM2 cron or node-cron
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const prisma = new PrismaClient();
const ses = new SESClient({ region: process.env.AWS_REGION || "eu-central-1" });

const FROM_EMAIL = "Matury Online <noreply@matury-online.pl>";

// ── Streak reset (run daily at 00:05) ──────────────────────────────────────
export async function resetBrokenStreaks() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  // Users who were active but NOT today or yesterday
  const result = await prisma.user.updateMany({
    where: {
      currentStreak: { gt: 0 },
      lastActiveAt: { lt: yesterday },
    },
    data: { currentStreak: 0 },
  });

  console.log(`[CRON] Reset ${result.count} broken streaks`);
  return result.count;
}

// ── Streak reminder emails (run daily at 18:00) ───────────────────────────
export async function sendStreakReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Users with streak > 0 who haven't been active today
  const users = await prisma.user.findMany({
    where: {
      currentStreak: { gte: 3 },
      lastActiveAt: { lt: today },
      subscriptionStatus: { in: ["ACTIVE", "ONE_TIME"] },
    },
    select: { id: true, email: true, name: true, currentStreak: true },
    take: 500,
  });

  let sent = 0;
  for (const user of users) {
    // Check if already emailed today
    const alreadySent = await prisma.emailLog.findFirst({
      where: {
        userId: user.id,
        type: "streak_reminder",
        sentAt: { gte: today },
      },
    });
    if (alreadySent) continue;

    try {
      const res = await ses.send(
        new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [user.email] },
          Message: {
            Subject: {
              Data: `🔥 ${user.name || "Hej"}, Twoja seria ${user.currentStreak} dni jest zagrożona!`,
            },
            Body: {
              Html: {
                Data: `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a1a;">🔥 Nie trać swojej serii!</h2>
  <p>Cześć ${user.name || ""}!</p>
  <p>Masz aktualnie <strong>${user.currentStreak} dni</strong> nauki z rzędu. Nie pozwól, żeby ta seria się skończyła!</p>
  <p>Wystarczy odpowiedzieć na 5 pytań, żeby utrzymać passę.</p>
  <a href="https://www.matury-online.pl/dashboard" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
    Kontynuuj naukę →
  </a>
  <p style="color: #666; font-size: 13px; margin-top: 24px;">Nie chcesz więcej dostawać takich wiadomości? Zmień ustawienia powiadomień w swoim profilu.</p>
</div>`,
              },
            },
          },
        }),
      );

      await prisma.emailLog.create({
        data: {
          userId: user.id,
          email: user.email,
          type: "streak_reminder",
          messageId: res.MessageId || null,
        },
      });
      sent++;
    } catch (err) {
      console.error(
        `[CRON] Failed to send streak reminder to ${user.email}:`,
        err,
      );
    }
  }

  console.log(`[CRON] Sent ${sent} streak reminders`);
  return sent;
}

// ── Win-back emails (inactive 7+ days, run weekly) ────────────────────────
export async function sendWinBackEmails() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const users = await prisma.user.findMany({
    where: {
      lastActiveAt: { gte: thirtyDaysAgo, lte: sevenDaysAgo },
      subscriptionStatus: { in: ["ACTIVE", "ONE_TIME", "FREE"] },
    },
    select: { id: true, email: true, name: true },
    take: 200,
  });

  let sent = 0;
  for (const user of users) {
    const recentEmail = await prisma.emailLog.findFirst({
      where: {
        userId: user.id,
        type: "win_back",
        sentAt: { gte: sevenDaysAgo },
      },
    });
    if (recentEmail) continue;

    try {
      await ses.send(
        new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [user.email] },
          Message: {
            Subject: {
              Data: `📚 ${user.name || "Hej"}, Twoja matura się zbliża!`,
            },
            Body: {
              Html: {
                Data: `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2>📚 Tęsknimy za Tobą!</h2>
  <p>Cześć ${user.name || ""}!</p>
  <p>Nie widzieliśmy Cię od jakiegoś czasu. Pamiętaj, że regularna nauka to klucz do sukcesu na maturze.</p>
  <p>Wróć i rozwiąż kilka pytań — zajmie to tylko 5 minut!</p>
  <a href="https://www.matury-online.pl/dashboard" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
    Wracam do nauki →
  </a>
</div>`,
              },
            },
          },
        }),
      );

      await prisma.emailLog.create({
        data: { userId: user.id, email: user.email, type: "win_back" },
      });
      sent++;
    } catch (err) {
      console.error(`[CRON] Failed to send win-back to ${user.email}:`, err);
    }
  }

  console.log(`[CRON] Sent ${sent} win-back emails`);
  return sent;
}

// ── Weekly summary (run Sunday 10:00) ─────────────────────────────────────
export async function sendWeeklySummaries() {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const activeUsers = await prisma.user.findMany({
    where: { lastActiveAt: { gte: weekAgo } },
    select: {
      id: true,
      email: true,
      name: true,
      totalXp: true,
      currentStreak: true,
    },
    take: 1000,
  });

  let sent = 0;
  for (const user of activeUsers) {
    const weekAnswers = await prisma.answer.count({
      where: { userId: user.id, createdAt: { gte: weekAgo } },
    });
    const weekCorrect = await prisma.answer.count({
      where: { userId: user.id, createdAt: { gte: weekAgo }, isCorrect: true },
    });

    if (weekAnswers === 0) continue;

    const accuracy = Math.round((weekCorrect / weekAnswers) * 100);

    try {
      await ses.send(
        new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [user.email] },
          Message: {
            Subject: {
              Data: `📊 Twój tygodniowy raport — ${weekAnswers} pytań, ${accuracy}% poprawnie`,
            },
            Body: {
              Html: {
                Data: `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2>📊 Podsumowanie tygodnia</h2>
  <p>Cześć ${user.name || ""}! Oto Twoje wyniki z ostatniego tygodnia:</p>
  <div style="background: #f4f4f5; padding: 16px; border-radius: 12px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>📝 Pytania:</strong> ${weekAnswers}</p>
    <p style="margin: 4px 0;"><strong>✅ Poprawność:</strong> ${accuracy}%</p>
    <p style="margin: 4px 0;"><strong>🔥 Aktualna seria:</strong> ${user.currentStreak} dni</p>
    <p style="margin: 4px 0;"><strong>⭐ Łączne XP:</strong> ${user.totalXp}</p>
  </div>
  <a href="https://www.matury-online.pl/dashboard" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
    Zobacz pełne statystyki →
  </a>
</div>`,
              },
            },
          },
        }),
      );

      await prisma.emailLog.create({
        data: { userId: user.id, email: user.email, type: "weekly_summary" },
      });
      sent++;
    } catch (err) {
      console.error(`[CRON] Failed weekly summary for ${user.email}:`, err);
    }
  }

  console.log(`[CRON] Sent ${sent} weekly summaries`);
  return sent;
}

// ── CLI runner ─────────────────────────────────────────────────────────────
const job = process.argv[2];
const jobs: Record<string, () => Promise<any>> = {
  "reset-streaks": resetBrokenStreaks,
  "streak-reminders": sendStreakReminders,
  "win-back": sendWinBackEmails,
  "weekly-summary": sendWeeklySummaries,
};

if (job && jobs[job]) {
  jobs[job]()
    .then((result) => {
      console.log(`Done:`, result);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
