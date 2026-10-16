import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { saveAccount, syncCalendar } from "@/server/google/calendar";
import { checkState, exchangeCode, oauthConfigFromEnv } from "@/server/google/oauth";

export const dynamic = "force-dynamic";

/** Google redirects here after consent: check state, store the encrypted refresh token, first sync. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL ?? url.origin;
  const back = (r: string) => NextResponse.redirect(`${base}/nastavitve?google=${r}`);
  if (!(await getCurrentUser())) return NextResponse.redirect(`${base}/login`);
  const cfg = oauthConfigFromEnv();
  if (!cfg) return back("manjka");
  const state = url.searchParams.get("state") ?? "";
  const cookie = (await cookies()).get("g_state")?.value;
  if (url.searchParams.get("error")) return back("zavrnjeno");
  if (!cookie || cookie !== state || !checkState(state, cfg.secret)) return back("napaka");
  try {
    const t = await exchangeCode(cfg, url.searchParams.get("code") ?? "");
    if (!t.refreshToken || !t.email) return back("napaka");
    const db = getDb();
    await saveAccount(db, { email: t.email, refreshToken: t.refreshToken, scope: t.scope }, cfg.secret);
    await syncCalendar(db);
    const res = back("ok");
    res.cookies.delete("g_state");
    return res;
  } catch (e) {
    console.error("[google] callback failed:", e instanceof Error ? e.message : "unknown");
    return back("napaka");
  }
}
