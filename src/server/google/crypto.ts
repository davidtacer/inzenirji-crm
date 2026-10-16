import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM with a key derived from BETTER_AUTH_SECRET (ADR-029): tokens are useless without the server secret. */
function key(secret: string) {
  if (!secret) throw new Error("ENCRYPTION_SECRET_MISSING");
  return createHash("sha256").update(`google-token:${secret}`).digest();
}

export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(token: string, secret: string): string {
  const [iv, tag, data] = token.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
