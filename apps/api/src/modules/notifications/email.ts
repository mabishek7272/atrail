import nodemailer from "nodemailer";
import { prisma } from "../../db.js";

const isConfigured = !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Standard welcome email template ──────────────────────────────────────────
// Plain-looking, text-heavy design avoids spam filters.
// Never put the word "password" as a bold heading — use "access code" or plain text.
export function welcomeEmailHtml(opts: {
  name: string;
  orgName: string;
  loginEmail: string;
  tempPassword: string;
  loginUrl?: string;
}): string {
  const url = opts.loginUrl ?? "https://atrail.in/login";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">

  <!-- Header -->
  <tr><td style="background:#0f172a;padding:28px 32px">
    <h1 style="margin:0;color:#38bdf8;font-size:22px;letter-spacing:1px">ATRAIL</h1>
    <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">Enterprise Platform</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px">
    <p style="font-size:16px;color:#1e293b;margin:0 0 12px">Hi ${opts.name},</p>
    <p style="color:#475569;line-height:1.6;margin:0 0 20px">
      Your organization <strong>${opts.orgName}</strong> has been set up on Atrail.
      Use the details below to sign in for the first time.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:0">
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0">
          <span style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.5px">Platform</span><br>
          <a href="${url}" style="color:#0284c7;text-decoration:none;font-weight:600">${url}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0">
          <span style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.5px">Email</span><br>
          <span style="color:#1e293b;font-family:monospace">${opts.loginEmail}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px">
          <span style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.5px">Temporary access code</span><br>
          <span style="color:#1e293b;font-family:monospace;font-size:16px;letter-spacing:1px">${opts.tempPassword}</span>
        </td>
      </tr>
    </table>

    <p style="color:#dc2626;font-size:13px;margin:16px 0 0">
      Please log in and change your access code immediately.
    </p>

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8">
      If this email was sent to you by mistake, you can safely ignore it.
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">
      Atrail Enterprise Platform &nbsp;·&nbsp; atrail.in
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// Resolves the best delivery email for a user:
// 1. personalEmail from UserProfile (real inbox like Gmail/Yahoo)
// 2. Fall back to login email
export async function resolveDeliveryEmail(userId: string): Promise<{ email: string; fullName: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      fullName: true,
      profile: { select: { personalEmail: true } },
    },
  });
  if (!user) return null;
  return {
    email: user.profile?.personalEmail || user.email,
    fullName: user.fullName,
  };
}

export async function sendEmailToUser(
  userId: string,
  subject: string,
  htmlContent: string
) {
  try {
    const user = await resolveDeliveryEmail(userId);
    if (!user?.email) return;

    if (!isConfigured) {
      console.info(`[Email] Sandbox — would send to ${user.email}: ${subject}`);
      return;
    }

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Atrail Platform" <ammedtech.solution@gmail.com>',
      to: user.email,
      subject,
      html: htmlContent,
    });

    console.info(`[Email] Sent to ${user.email}: ${info.messageId}`);
  } catch (err) {
    console.error(`[Email] Failed for user ${userId}:`, err);
  }
}

// Send to a raw email address directly (used for credential emails)
export async function sendEmailTo(
  toEmail: string,
  subject: string,
  htmlContent: string
) {
  if (!isConfigured) {
    console.info(`[Email] Sandbox — would send to ${toEmail}: ${subject}`);
    return;
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Atrail Platform" <ammedtech.solution@gmail.com>',
      to: toEmail,
      subject,
      html: htmlContent,
    });
    console.info(`[Email] Sent to ${toEmail}: ${info.messageId}`);
  } catch (err) {
    console.error(`[Email] Failed to ${toEmail}:`, err);
  }
}
