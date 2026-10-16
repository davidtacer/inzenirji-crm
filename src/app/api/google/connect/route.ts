import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { authUrl, makeState, oauthConfigFromEnv } from "@/server/google/oauth";

export const dynamic = "force-dynamic";

/** Starts the Google connection (owner only). */
export async function GET(req: Request) {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  if (!(await getCurrentUser())) return NextResponse.redirect(`${base}/login`);
  const cfg = oauthConfigFromEnv();
  if (!cfg) return NextResponse.redirect(`${base}/nastavitve?google=manjka`);
  const state = makeState(cfg.secret);
  const res = NextResponse.redirect(authUrl(cfg, state));
  res.cookies.set("g_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  return res;
}
