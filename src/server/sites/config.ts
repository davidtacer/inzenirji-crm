import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { settings } from "../db/schema";
import { decrypt, encrypt } from "../google/crypto";
import type { GhConfig } from "./github";

/*
 * "Izdelava strani" settings (TASK-039 §6): GitHub App credentials and the template. One row in `settings`
 * (key `sitesConfig`); the private key is stored encrypted (AES-GCM, same as the MCP key and Google tokens).
 */

const KEY = "sitesConfig";
const secret = () => process.env.BETTER_AUTH_SECRET ?? "";

export type SitesConfig = {
  appId: string;
  installationId: string;
  owner: string;
  templateRepo: string;
  editorConfigRepo: string;
  siteGuideUrl: string;
  guideVersion: string;
  hasKey: boolean;
  hasToken: boolean;
};

const DEFAULTS: Omit<SitesConfig, "hasKey" | "hasToken"> = { appId: "", installationId: "", owner: "davidtacer", templateRepo: "inzenirji-site-template", editorConfigRepo: "inzenirji-editor-config", siteGuideUrl: "", guideVersion: "1.2" };

type Stored = Omit<SitesConfig, "hasKey" | "hasToken"> & { keyEnc?: string; tokenEnc?: string };

async function read(db: Db): Promise<Stored> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  return { ...DEFAULTS, ...((row?.value as Partial<Stored> | undefined) ?? {}) };
}

export async function getSitesConfig(db: Db): Promise<SitesConfig> {
  const { keyEnc, tokenEnc, ...rest } = await read(db);
  return { ...rest, hasKey: !!keyEnc, hasToken: !!tokenEnc };
}

/** Credentials for the GitHub client, or null while anything is missing. */
export async function getGithubConfig(db: Db): Promise<GhConfig | null> {
  const s = await read(db);
  if (!s.owner) return null;
  try {
    if (s.tokenEnc) return { owner: s.owner, token: decrypt(s.tokenEnc, secret()) };
    if (!s.appId || !s.installationId || !s.keyEnc) return null;
    return { appId: s.appId, installationId: s.installationId, owner: s.owner, privateKey: decrypt(s.keyEnc, secret()) };
  } catch {
    return null;
  }
}

export type SitesConfigInput = Partial<Record<keyof Omit<SitesConfig, "hasKey" | "hasToken">, string>> & { privateKey?: string; token?: string };

export function validateSitesConfig(i: SitesConfigInput): { ok: true; value: Omit<SitesConfig, "hasKey" | "hasToken">; privateKey: string | null; token: string | null } | { ok: false; message: string } {
  const t = (v: string | undefined) => (v ?? "").trim();
  const appId = t(i.appId);
  const installationId = t(i.installationId);
  const owner = t(i.owner);
  const templateRepo = t(i.templateRepo);
  const editorConfigRepo = t(i.editorConfigRepo);
  const siteGuideUrl = t(i.siteGuideUrl);
  const guideVersion = t(i.guideVersion);
  const pk = t(i.privateKey);
  const tok = t(i.token);
  if (appId && !/^\d{1,12}$/.test(appId)) return { ok: false, message: "App ID so same številke (na strani aplikacije »App ID«)." };
  if (installationId && !/^\d{1,12}$/.test(installationId)) return { ok: false, message: "Installation ID so same številke (konec naslova po namestitvi aplikacije)." };
  if (owner && !/^[A-Za-z0-9-]{1,39}$/.test(owner)) return { ok: false, message: "GitHub uporabnik: črke, številke in -." };
  for (const [v, label] of [[templateRepo, "Ime predloge"], [editorConfigRepo, "Ime repozitorija urednikov"]] as const) if (!/^[A-Za-z0-9._-]{1,100}$/.test(v)) return { ok: false, message: `${label}: samo črke, številke, . _ -` };
  if (siteGuideUrl && !/^https:\/\/[^\s]+$/.test(siteGuideUrl)) return { ok: false, message: "Povezava do navodil se mora začeti s https://" };
  if (!/^\d+\.\d+$/.test(guideVersion)) return { ok: false, message: "Verzija navodil: oblika 1.2" };
  if (pk && !/^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+-----END (RSA )?PRIVATE KEY-----$/.test(pk)) return { ok: false, message: "Zasebni ključ mora biti celotna vsebina .pem datoteke (od -----BEGIN do -----END)." };
  if (tok && !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(tok)) return { ok: false, message: "Žeton se mora začeti z github_pat_ (fine-grained žeton)." };
  return { ok: true, value: { appId, installationId, owner, templateRepo, editorConfigRepo, siteGuideUrl, guideVersion }, privateKey: pk || null, token: tok || null };
}

/** Saves the settings; an empty private key keeps the stored one. */
export async function saveSitesConfig(db: Db, v: Omit<SitesConfig, "hasKey" | "hasToken">, privateKey: string | null, now = new Date(), token: string | null = null): Promise<void> {
  const cur = await read(db);
  const value: Stored = {
    ...v,
    ...(privateKey ? { keyEnc: encrypt(privateKey, secret()) } : cur.keyEnc ? { keyEnc: cur.keyEnc } : {}),
    ...(token ? { tokenEnc: encrypt(token, secret()) } : cur.tokenEnc ? { tokenEnc: cur.tokenEnc } : {}),
  };
  await db.insert(settings).values({ key: KEY, value, updatedAt: now }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
}

/** Removes the stored fallback token so the GitHub App is used again. */
export async function clearSitesToken(db: Db, now = new Date()): Promise<void> {
  const cur = await read(db);
  const { tokenEnc: _drop, ...value } = cur;
  void _drop;
  await db.insert(settings).values({ key: KEY, value, updatedAt: now }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
}
