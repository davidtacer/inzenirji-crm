import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> };
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** SMTP from the environment (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM); missing = error. */
export function createMailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer {
  const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Email is not configured; missing: ${missing.join(", ")}`);
  const port = Number(env.SMTP_PORT);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  const from = env.EMAIL_FROM!;
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

/**
 * Outreach mailbox `david@inzenirji.si` (ADR-013), separate from the system mailbox used for login.
 * OUTREACH_SMTP_HOST/PORT default to the system SMTP server; OUTREACH_FROM is the display sender.
 */
export function createOutreachMailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer {
  return createMailerFromEnv({
    SMTP_HOST: env.OUTREACH_SMTP_HOST ?? env.SMTP_HOST,
    SMTP_PORT: env.OUTREACH_SMTP_PORT ?? env.SMTP_PORT,
    SMTP_USER: env.OUTREACH_SMTP_USER,
    SMTP_PASSWORD: env.OUTREACH_SMTP_PASSWORD,
    EMAIL_FROM: env.OUTREACH_FROM,
  });
}

/** In-memory mailer for tests. */
export function createCaptureMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}
