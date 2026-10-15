import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Signed opt-out tokens for the List-Unsubscribe header and the link in the e-mail (ADR-007).
 * token = base64url(email) "." base64url(HMAC-SHA256(secret, "unsubscribe:" + email))[0..22]
 */

function mac(secret: string, email: string) {
  return createHmac("sha256", secret).update(`unsubscribe:${email}`).digest("base64url").slice(0, 22);
}

export function unsubscribeToken(email: string, secret: string): string {
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET_MISSING");
  return `${Buffer.from(email, "utf8").toString("base64url")}.${mac(secret, email)}`;
}

/** Returns the e-mail when the token is valid, otherwise null. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  if (!secret) return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  let email: string;
  try {
    email = Buffer.from(b64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const want = Buffer.from(mac(secret, email));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? email : null;
}
