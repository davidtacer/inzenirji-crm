import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Google OAuth for the owner's Calendar (TASK-012b, ADR-029). Read-only calendar scope; offline access for a
 * refresh token. Client id/secret are GitHub secrets (GOOGLE_OAUTH_CLIENT_ID / _SECRET).
 */

/** Calendar (TASK-012b) + Search Console for the weekly report (TASK-015), both read-only. */
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/webmasters.readonly"];
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string; secret: string };

export function oauthConfigFromEnv(env: Record<string, string | undefined> = process.env): OAuthConfig | null {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.BETTER_AUTH_SECRET) return null;
  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: `${env.APP_URL ?? "https://crm.inzenirji.si"}/api/google/callback`,
    secret: env.BETTER_AUTH_SECRET,
  };
}

/** state = timestamp.hmac — protects the callback against forged requests (valid 10 min). */
export function makeState(secret: string, now = Date.now()): string {
  const t = String(now);
  return `${t}.${createHmac("sha256", secret).update(`google-state:${t}`).digest("base64url")}`;
}

export function checkState(state: string, secret: string, now = Date.now()): boolean {
  const [t, sig] = state.split(".");
  if (!t || !sig || now - Number(t) > 10 * 60_000 || Number(t) > now + 60_000) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`google-state:${t}`).digest("base64url"));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function authUrl(cfg: OAuthConfig, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

export class GoogleError extends Error {
  constructor(public status: number) {
    super(`GOOGLE_HTTP_${status}`);
  }
}

export async function exchangeCode(cfg: OAuthConfig, code: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new GoogleError(res.status);
  const d = (await res.json()) as { access_token: string; refresh_token?: string; scope: string; id_token?: string };
  // The id_token comes straight from Google over TLS; we only read the e-mail claim from it.
  const email = d.id_token ? (JSON.parse(Buffer.from(d.id_token.split(".")[1], "base64url").toString("utf8")) as { email?: string }).email : undefined;
  return { accessToken: d.access_token, refreshToken: d.refresh_token ?? null, scope: d.scope, email: email ?? null };
}

export async function refreshAccessToken(cfg: Pick<OAuthConfig, "clientId" | "clientSecret">, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new GoogleError(res.status);
  return ((await res.json()) as { access_token: string }).access_token;
}
