import { createSign } from "node:crypto";

/*
 * Minimal GitHub REST client authenticated as a GitHub App installation (TASK-039, ADR-056). `fetch` only, no SDK:
 * the app JWT is signed with the app's private key, exchanged for a short-lived installation token. Everything is
 * idempotent where it can be (reuse an existing repo, update a file by its sha).
 */

/** GitHub App credentials, or (fallback) a fine-grained personal access token that is used as is. */
export type GhConfig = { owner: string; appId?: string; installationId?: string; privateKey?: string; token?: string };
export class GhError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const b64 = (v: Buffer | string) => Buffer.from(v).toString("base64url");

/**
 * Rebuilds a PEM that was mangled by copy and paste (spaces or \r\n instead of newlines, literal "\n", one long line):
 * keeps the BEGIN/END type, re-wraps the body at 64 characters. Returns null when it is not a PEM private key.
 */
export function normalizePem(raw: string): string | null {
  const t = raw.trim().replace(/\\n/g, "\n").replace(/\r/g, "");
  const m = t.match(/-----BEGIN ((?:RSA |EC )?PRIVATE KEY)-----([\s\S]+?)-----END \1-----/);
  if (!m) return null;
  const body = (m[2] as string).replace(/[^A-Za-z0-9+/=]/g, "");
  if (body.length < 100) return null;
  return `-----BEGIN ${m[1]}-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END ${m[1]}-----\n`;
}

/** App JWT (RS256), valid 9 minutes. */
export function appJwt(cfg: { appId: string; privateKey: string }, nowSec = Math.floor(Date.now() / 1000)): string {
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: cfg.appId }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(normalizePem(cfg.privateKey) ?? cfg.privateKey);
  return `${head}.${body}.${b64(sig)}`;
}

export type Gh = ReturnType<typeof createGithub>;

export function createGithub(cfg: GhConfig, fetchImpl: typeof fetch = fetch) {
  const API = "https://api.github.com";
  let token: { value: string; exp: number } | null = null;

  async function raw(method: string, path: string, body?: unknown, auth: "app" | "install" = "install"): Promise<Response> {
    let bearer: string;
    if (cfg.token) bearer = cfg.token;
    else if (!cfg.appId || !cfg.privateKey || !cfg.installationId) throw new GhError("GitHub ni nastavljen.", 401);
    else if (auth === "app") bearer = appJwt({ appId: cfg.appId, privateKey: cfg.privateKey });
    else {
      if (!token || token.exp < Date.now() + 60_000) {
        const r = await fetchImpl(`${API}/app/installations/${cfg.installationId}/access_tokens`, { method: "POST", headers: headers(appJwt({ appId: cfg.appId, privateKey: cfg.privateKey })) });
        if (!r.ok) throw new GhError(`GitHub: prijava aplikacije ni uspela (${r.status}). Preveri App ID, Installation ID in zasebni ključ.`, r.status);
        const j = (await r.json()) as { token: string; expires_at: string };
        token = { value: j.token, exp: Date.parse(j.expires_at) };
      }
      bearer = token.value;
    }
    return fetchImpl(`${API}${path}`, { method, headers: headers(bearer), body: body === undefined ? undefined : JSON.stringify(body) });
  }
  const headers = (bearer: string) => ({ authorization: `Bearer ${bearer}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "inzenirji-crm", "content-type": "application/json" });
  async function json<T>(r: Response, what: string): Promise<T> {
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new GhError(`GitHub ${what}: ${r.status} ${t.slice(0, 200)}`, r.status);
    }
    return (await r.json()) as T;
  }
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

  return {
    /** Who the installation is (for the settings "Preveri povezavo" button). */
    async whoami(): Promise<{ app: string; owner: string }> {
      if (cfg.token) {
        const u = await json<{ login: string }>(await raw("GET", "/user"), "user");
        return { app: "osebni žeton", owner: u.login };
      }
      const a = await json<{ name: string }>(await raw("GET", "/app", undefined, "app"), "app");
      const r = await json<{ total_count: number }>(await raw("GET", "/installation/repositories?per_page=1"), "repositories");
      return { app: a.name, owner: `${cfg.owner} (${r.total_count} repozitorijev)` };
    },

    async repoExists(repo: string): Promise<boolean> {
      const r = await raw("GET", `/repos/${cfg.owner}/${repo}`);
      if (r.status === 404) return false;
      await json(r, `repo ${repo}`);
      return true;
    },

    /** Creates a private repo from the template (all branches). Reuses an existing repo of that name. */
    async createFromTemplate(templateRepo: string, name: string): Promise<{ created: boolean }> {
      if (await this.repoExists(name)) return { created: false };
      await json(await raw("POST", `/repos/${cfg.owner}/${templateRepo}/generate`, { owner: cfg.owner, name, private: true, include_all_branches: true, description: `Spletna stran ${name} (Inženirji.si)` }), "generate");
      for (let i = 0; i < 15; i++) {
        if (await this.repoExists(name)) return { created: true };
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new GhError("GitHub: repozitorij se po ustvarjanju ni pojavil v 15 sekundah. Poskusi znova.", 504);
    },

    async branchSha(repo: string, branch: string): Promise<string | null> {
      const r = await raw("GET", `/repos/${cfg.owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      if (r.status === 404) return null;
      return (await json<{ object: { sha: string } }>(r, "ref")).object.sha;
    },

    async ensureBranch(repo: string, branch: string, from: string): Promise<void> {
      if (await this.branchSha(repo, branch)) return;
      const sha = await this.branchSha(repo, from);
      if (!sha) throw new GhError(`GitHub: veje ${from} ni v ${repo}.`, 404);
      await json(await raw("POST", `/repos/${cfg.owner}/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha }), "create branch");
    },

    async getFile(repo: string, path: string, branch: string): Promise<{ sha: string; content: string } | null> {
      const r = await raw("GET", `/repos/${cfg.owner}/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`);
      if (r.status === 404) return null;
      const j = await json<{ sha: string; content: string; encoding: string }>(r, `file ${path}`);
      return { sha: j.sha, content: Buffer.from(j.content, "base64").toString("utf8") };
    },

    /** Creates or updates a file; skips the commit when the content is unchanged. Returns whether a commit was made. */
    async putFile(repo: string, path: string, content: string | Buffer, message: string, branch: string): Promise<{ changed: boolean }> {
      const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
      const cur = await raw("GET", `/repos/${cfg.owner}/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`);
      let sha: string | undefined;
      if (cur.ok) {
        const j = (await cur.json()) as { sha: string; content: string };
        if (Buffer.from(j.content, "base64").equals(buf)) return { changed: false };
        sha = j.sha;
      } else if (cur.status !== 404) await json(cur, `file ${path}`);
      await json(await raw("PUT", `/repos/${cfg.owner}/${repo}/contents/${enc(path)}`, { message, content: buf.toString("base64"), branch, ...(sha ? { sha } : {}) }), `put ${path}`);
      return { changed: true };
    },
  };
}
