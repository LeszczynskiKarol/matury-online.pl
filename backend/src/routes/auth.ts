import { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const ses = new SESClient({
  region: process.env.AWS_SES_REGION || "us-east-1",
});
const FROM_EMAIL =
  process.env.FROM_EMAIL || "Matury Online <noreply@matury-online.pl>";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.matury-online.pl";

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_THRESHOLD = 0.5;
const VERIFICATION_CODE_TTL_MIN = 15;
const RESET_TOKEN_TTL_MIN = 30;
const RESEND_COOLDOWN_SEC = 60;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function verifyRecaptcha(
  token: string,
  action: string,
): Promise<{ success: boolean; score: number }> {
  if (!RECAPTCHA_SECRET) return { success: true, score: 1.0 };
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: RECAPTCHA_SECRET, response: token }),
  });
  const data = (await res.json()) as {
    success: boolean;
    score?: number;
    action?: string;
  };
  if (!data.success) return { success: false, score: 0 };
  if (data.action && data.action !== action)
    return { success: false, score: 0 };
  return { success: true, score: data.score ?? 0 };
}

async function sendVerificationEmail(
  email: string,
  name: string | null,
  code: string,
) {
  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: `${code} — Twój kod weryfikacyjny Matury Online` },
        Body: {
          Html: {
            Data: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-block;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#1e3a5f);line-height:48px;text-align:center;">
      <span style="color:white;font-weight:bold;font-size:20px;">M</span>
    </div>
  </div>
  <h2 style="color:#1a1a1a;text-align:center;margin-bottom:8px;">Potwierdź swój email</h2>
  <p style="color:#666;text-align:center;margin-bottom:24px;">Cześć${name ? ` ${name}` : ""}! Wpisz poniższy kod, aby dokończyć rejestrację.</p>
  <div style="background:#f4f4f5;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
    <span style="font-family:'SF Mono','Fira Code',monospace;font-size:36px;font-weight:800;letter-spacing:8px;color:#1a1a1a;user-select:all;cursor:pointer;" title="Kliknij, żeby skopiować">${code}</span>
  </div>
  <p style="color:#999;font-size:13px;text-align:center;">Kod wygasa za ${VERIFICATION_CODE_TTL_MIN} minut.</p>
</div>`,
          },
        },
      },
    }),
  );
}

async function sendResetEmail(
  email: string,
  name: string | null,
  token: string,
) {
  const resetUrl = `${FRONTEND_URL}/auth/reset-password?token=${token}`;
  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Resetowanie hasła — Matury Online" },
        Body: {
          Html: {
            Data: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
  <h2 style="color:#1a1a1a;text-align:center;">Resetowanie hasła</h2>
  <p style="color:#666;text-align:center;">Cześć${name ? ` ${name}` : ""}! Kliknij przycisk, aby ustawić nowe hasło.</p>
  <div style="text-align:center;margin:24px 0;">
    <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;text-decoration:none;border-radius:12px;font-weight:600;">Resetuj hasło →</a>
  </div>
  <p style="color:#999;font-size:13px;text-align:center;">Link wygasa za ${RESET_TOKEN_TTL_MIN} minut.</p>
</div>`,
          },
        },
      },
    }),
  );
}

function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Min. 8 znaków");
  if (!/[a-z]/.test(password)) errors.push("Mała litera");
  if (!/[A-Z]/.test(password)) errors.push("Wielka litera");
  if (!/[0-9]/.test(password)) errors.push("Cyfra");
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push("Znak specjalny");
  return { valid: errors.length === 0, errors };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // ── Register ─────────────────────────────────────────────────────────────
  app.post(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password", "passwordConfirm"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            passwordConfirm: { type: "string" },
            name: { type: "string" },
            acceptTerms: { type: "boolean" },
            recaptchaToken: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const {
        email,
        password,
        passwordConfirm,
        name,
        acceptTerms,
        recaptchaToken,
      } = req.body as any;

      if (recaptchaToken) {
        const c = await verifyRecaptcha(recaptchaToken, "register");
        if (!c.success || c.score < RECAPTCHA_THRESHOLD)
          return reply
            .code(403)
            .send({ error: "Weryfikacja reCAPTCHA nie powiodła się." });
      } else if (RECAPTCHA_SECRET) {
        return reply.code(400).send({ error: "Brak tokenu reCAPTCHA" });
      }

      if (!acceptTerms)
        return reply.code(400).send({ error: "Musisz zaakceptować regulamin" });
      if (password !== passwordConfirm)
        return reply.code(400).send({ error: "Hasła nie są identyczne" });

      const strength = validatePasswordStrength(password);
      if (!strength.valid)
        return reply
          .code(400)
          .send({ error: `Hasło zbyt słabe: ${strength.errors.join(", ")}` });

      const existing = await app.prisma.user.findUnique({ where: { email } });
      if (existing) {
        if (!existing.emailVerified) {
          const code = generateCode();
          const passwordHash = await bcrypt.hash(password, 12);
          await app.prisma.user.update({
            where: { id: existing.id },
            data: {
              passwordHash,
              name: name || existing.name,
              verificationCode: code,
              verificationCodeExpiresAt: new Date(
                Date.now() + VERIFICATION_CODE_TTL_MIN * 60000,
              ),
            },
          });
          await sendVerificationEmail(email, name || existing.name, code);
          return { requiresVerification: true, email };
        }
        return reply
          .code(409)
          .send({ error: "Ten email jest już zarejestrowany" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const code = generateCode();
      await app.prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
          emailVerified: false,
          verificationCode: code,
          verificationCodeExpiresAt: new Date(
            Date.now() + VERIFICATION_CODE_TTL_MIN * 60000,
          ),
        },
      });
      await sendVerificationEmail(email, name, code);
      return { requiresVerification: true, email };
    },
  );

  // ── Verify email ─────────────────────────────────────────────────────────
  app.post(
    "/verify",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "code"],
          properties: {
            email: { type: "string" },
            code: { type: "string", minLength: 6, maxLength: 6 },
          },
        },
      },
    },
    async (req, reply) => {
      const { email, code } = req.body as any;
      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user || user.emailVerified)
        return reply
          .code(400)
          .send({ error: "Nieprawidłowy email lub konto już zweryfikowane" });
      if (!user.verificationCode || user.verificationCode !== code)
        return reply.code(400).send({ error: "Nieprawidłowy kod" });
      if (
        !user.verificationCodeExpiresAt ||
        user.verificationCodeExpiresAt < new Date()
      )
        return reply.code(400).send({ error: "Kod wygasł. Wyślij nowy." });

      const updated = await app.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          verificationCode: null,
          verificationCodeExpiresAt: null,
        },
      });
      const token = app.jwt.sign({ userId: updated.id, role: updated.role });
      reply
        .setCookie("token", token, {
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 604800,
        })
        .send({
          user: {
            id: updated.id,
            email: updated.email,
            name: updated.name,
            role: updated.role,
          },
          token,
        });
    },
  );

  // ── Resend code ──────────────────────────────────────────────────────────
  app.post(
    "/resend-code",
    {
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: { email: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { email } = req.body as any;
      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user || user.emailVerified) return { sent: true };

      if (user.verificationCodeExpiresAt) {
        const age =
          Date.now() -
          (user.verificationCodeExpiresAt.getTime() -
            VERIFICATION_CODE_TTL_MIN * 60000);
        if (age < RESEND_COOLDOWN_SEC * 1000) {
          return reply.code(429).send({
            error: `Poczekaj ${Math.ceil((RESEND_COOLDOWN_SEC * 1000 - age) / 1000)}s`,
          });
        }
      }

      const code = generateCode();
      await app.prisma.user.update({
        where: { id: user.id },
        data: {
          verificationCode: code,
          verificationCodeExpiresAt: new Date(
            Date.now() + VERIFICATION_CODE_TTL_MIN * 60000,
          ),
        },
      });
      await sendVerificationEmail(email, user.name, code);
      return { sent: true };
    },
  );

  // ── Login ────────────────────────────────────────────────────────────────
  app.post(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string" },
            password: { type: "string" },
            recaptchaToken: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { email, password, recaptchaToken } = req.body as any;

      if (recaptchaToken) {
        const c = await verifyRecaptcha(recaptchaToken, "login");
        if (!c.success || c.score < RECAPTCHA_THRESHOLD)
          return reply
            .code(403)
            .send({ error: "Weryfikacja reCAPTCHA nie powiodła się." });
      } else if (RECAPTCHA_SECRET) {
        return reply.code(400).send({ error: "Brak tokenu reCAPTCHA" });
      }

      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash)
        return reply.code(401).send({ error: "Nieprawidłowy email lub hasło" });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid)
        return reply.code(401).send({ error: "Nieprawidłowy email lub hasło" });

      if (!user.emailVerified) {
        const code = generateCode();
        await app.prisma.user.update({
          where: { id: user.id },
          data: {
            verificationCode: code,
            verificationCodeExpiresAt: new Date(
              Date.now() + VERIFICATION_CODE_TTL_MIN * 60000,
            ),
          },
        });
        await sendVerificationEmail(email, user.name, code);
        return reply.code(403).send({
          error: "Email nie zweryfikowany. Wysłaliśmy nowy kod.",
          code: "EMAIL_NOT_VERIFIED",
          email,
        });
      }

      const token = app.jwt.sign({ userId: user.id, role: user.role });
      reply
        .setCookie("token", token, {
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 604800,
        })
        .send({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          token,
        });
    },
  );

  // ── Forgot password ──────────────────────────────────────────────────────
  app.post(
    "/forgot-password",
    {
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string" },
            recaptchaToken: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { email, recaptchaToken } = req.body as any;
      if (recaptchaToken)
        await verifyRecaptcha(recaptchaToken, "forgot_password");

      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user) return { sent: true };

      const active = await app.prisma.passwordReset.count({
        where: { userId: user.id, expiresAt: { gt: new Date() }, usedAt: null },
      });
      if (active >= 3) return { sent: true };

      const token = generateToken();
      await app.prisma.passwordReset.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60000),
        },
      });
      await sendResetEmail(email, user.name, token);
      return { sent: true };
    },
  );

  // ── Validate reset token ────────────────────────────────────────────────
  app.get(
    "/reset-password/validate",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["token"],
          properties: { token: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { token } = req.query as any;
      const r = await app.prisma.passwordReset.findUnique({ where: { token } });
      if (!r || r.usedAt || r.expiresAt < new Date())
        return reply.code(400).send({ valid: false });
      return { valid: true };
    },
  );

  // ── Reset password ───────────────────────────────────────────────────────
  app.post(
    "/reset-password",
    {
      schema: {
        body: {
          type: "object",
          required: ["token", "password", "passwordConfirm"],
          properties: {
            token: { type: "string" },
            password: { type: "string" },
            passwordConfirm: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { token, password, passwordConfirm } = req.body as any;
      if (password !== passwordConfirm)
        return reply.code(400).send({ error: "Hasła nie są identyczne" });
      const s = validatePasswordStrength(password);
      if (!s.valid)
        return reply
          .code(400)
          .send({ error: `Hasło zbyt słabe: ${s.errors.join(", ")}` });

      const r = await app.prisma.passwordReset.findUnique({ where: { token } });
      if (!r || r.usedAt || r.expiresAt < new Date())
        return reply
          .code(400)
          .send({ error: "Link wygasł lub jest nieprawidłowy" });

      const hash = await bcrypt.hash(password, 12);
      await app.prisma.$transaction([
        app.prisma.user.update({
          where: { id: r.userId },
          data: { passwordHash: hash, emailVerified: true },
        }),
        app.prisma.passwordReset.update({
          where: { id: r.id },
          data: { usedAt: new Date() },
        }),
        app.prisma.passwordReset.updateMany({
          where: { userId: r.userId, id: { not: r.id }, usedAt: null },
          data: { usedAt: new Date() },
        }),
      ]);
      return { success: true };
    },
  );

  // ── Google OAuth ─────────────────────────────────────────────────────────
  app.post(
    "/google",
    {
      schema: {
        body: {
          type: "object",
          required: ["credential"],
          properties: { credential: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { credential } = req.body as any;
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const p = ticket.getPayload()!;

      let user = await app.prisma.user.findUnique({
        where: { googleId: p.sub },
      });
      if (!user) {
        user = await app.prisma.user.findUnique({ where: { email: p.email! } });
        if (user) {
          user = await app.prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: p.sub,
              avatarUrl: p.picture,
              emailVerified: true,
            },
          });
        } else {
          user = await app.prisma.user.create({
            data: {
              email: p.email!,
              name: p.name,
              googleId: p.sub,
              avatarUrl: p.picture,
              emailVerified: true,
            },
          });
        }
      }

      const token = app.jwt.sign({ userId: user.id, role: user.role });
      reply
        .setCookie("token", token, {
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 604800,
        })
        .send({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          token,
        });
    },
  );

  app.get("/me", { preHandler: [app.authenticate] }, async (req) => {
    return app.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
        totalXp: true,
        globalLevel: true,
        currentStreak: true,
        longestStreak: true,
        lastActiveAt: true,
        selectedSubjects: {
          include: {
            subject: {
              select: {
                id: true,
                slug: true,
                name: true,
                icon: true,
                color: true,
              },
            },
          },
        },
        subjectProgress: {
          select: {
            subjectId: true,
            xp: true,
            level: true,
            questionsAnswered: true,
            correctAnswers: true,
            adaptiveDifficulty: true,
          },
        },
      },
    });
  });

  app.post("/logout", async (_req, reply) => {
    reply.clearCookie("token", { path: "/" }).send({ ok: true });
  });
};
