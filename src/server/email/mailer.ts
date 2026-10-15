import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html: string };
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
