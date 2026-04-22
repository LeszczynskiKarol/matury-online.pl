// ============================================================================
// Contact Routes — Contact form via AWS SES
// ============================================================================

import { FastifyPluginAsync } from "fastify";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.AWS_SES_REGION || "us-east-1",
});
const FROM_EMAIL =
  process.env.FROM_EMAIL || "Matury Online <noreply@matury-online.pl>";
const CONTACT_TO_EMAIL =
  process.env.CONTACT_EMAIL || "mailing@matury-online.pl";

export const contactRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/send",
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "15 minutes",
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["name", "email", "subject", "message"],
          properties: {
            name: { type: "string", minLength: 2, maxLength: 100 },
            email: { type: "string", format: "email", maxLength: 255 },
            subject: { type: "string", minLength: 3, maxLength: 200 },
            message: { type: "string", minLength: 10, maxLength: 5000 },
            recaptchaToken: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, email, subject, message } = req.body as {
        name: string;
        email: string;
        subject: string;
        message: string;
      };

      // Sanitize
      const safeName = name.trim().slice(0, 100);
      const safeSubject = subject.trim().slice(0, 200);
      const safeMessage = message.trim().slice(0, 5000);
      const safeEmail = email.trim().toLowerCase();

      // Send email to admin
      try {
        await ses.send(
          new SendEmailCommand({
            Source: FROM_EMAIL,
            Destination: { ToAddresses: [CONTACT_TO_EMAIL] },
            ReplyToAddresses: [safeEmail],
            Message: {
              Subject: {
                Data: `[Kontakt] ${safeSubject}`,
              },
              Body: {
                Html: {
                  Data: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-block;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#1e3a5f);line-height:48px;text-align:center;">
      <span style="color:white;font-weight:bold;font-size:20px;">M</span>
    </div>
  </div>
  <h2 style="color:#1a1a1a;margin-bottom:16px;">Nowa wiadomość z formularza kontaktowego</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr>
      <td style="padding:8px 12px;font-weight:600;color:#666;width:100px;vertical-align:top;">Imię:</td>
      <td style="padding:8px 12px;color:#1a1a1a;">${escapeHtml(safeName)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;font-weight:600;color:#666;vertical-align:top;">Email:</td>
      <td style="padding:8px 12px;color:#1a1a1a;"><a href="mailto:${escapeHtml(safeEmail)}" style="color:#6366f1;">${escapeHtml(safeEmail)}</a></td>
    </tr>
    <tr>
      <td style="padding:8px 12px;font-weight:600;color:#666;vertical-align:top;">Temat:</td>
      <td style="padding:8px 12px;color:#1a1a1a;">${escapeHtml(safeSubject)}</td>
    </tr>
  </table>
  <div style="background:#f4f4f5;border-radius:12px;padding:20px;margin-bottom:24px;">
    <p style="color:#666;font-size:12px;font-weight:600;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Treść wiadomości:</p>
    <p style="color:#1a1a1a;white-space:pre-wrap;margin:0;line-height:1.6;">${escapeHtml(safeMessage)}</p>
  </div>
  <p style="color:#999;font-size:12px;text-align:center;">Możesz odpowiedzieć bezpośrednio na tego maila — trafi do nadawcy.</p>
</div>`,
                },
              },
            },
          }),
        );
      } catch (err: any) {
        app.log.error(`Contact email failed: ${err.message}`);
        return reply.code(500).send({
          error: "Nie udało się wysłać wiadomości. Spróbuj ponownie.",
        });
      }

      // Send confirmation to user
      try {
        await ses.send(
          new SendEmailCommand({
            Source: FROM_EMAIL,
            Destination: { ToAddresses: [safeEmail] },
            Message: {
              Subject: {
                Data: "Potwierdzenie — otrzymaliśmy Twoją wiadomość",
              },
              Body: {
                Html: {
                  Data: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-block;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#1e3a5f);line-height:48px;text-align:center;">
      <span style="color:white;font-weight:bold;font-size:20px;">M</span>
    </div>
  </div>
  <h2 style="color:#1a1a1a;text-align:center;margin-bottom:8px;">Dziękujemy za wiadomość!</h2>
  <p style="color:#666;text-align:center;margin-bottom:24px;">Cześć ${escapeHtml(safeName)}! Otrzymaliśmy Twoją wiadomość i postaramy się odpowiedzieć jak najszybciej — zwykle w ciągu 24 godzin.</p>
  <div style="background:#f4f4f5;border-radius:12px;padding:16px;margin-bottom:24px;">
    <p style="color:#666;font-size:12px;font-weight:600;margin:0 0 4px 0;">Temat:</p>
    <p style="color:#1a1a1a;margin:0;">${escapeHtml(safeSubject)}</p>
  </div>
  <p style="color:#999;font-size:13px;text-align:center;">Pozdrawiamy,<br/>Zespół Matury Online</p>
</div>`,
                },
              },
            },
          }),
        );
      } catch (err: any) {
        // Non-critical — admin already got the message
        app.log.warn(`Contact confirmation email failed: ${err.message}`);
      }

      return { success: true, message: "Wiadomość wysłana!" };
    },
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
