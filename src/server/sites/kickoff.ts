import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { projectFiles, siteProjects } from "../db/schema";
import { runningJob, startJob } from "../jobs";
import { readStored } from "../projects/storage";
import { buildBrief, buildKickoffPrompt, fillClaudeMd } from "./brief";
import { getSitesConfig } from "./config";
import type { Gh } from "./github";
import { loadBriefInput } from "./store";

/*
 * Kickoff package (TASK-039 §2). Runs as a background job; every step records its result in `site_projects.steps`
 * and is skipped on a retry once it succeeded, so nothing is duplicated (repo exists → reused, file unchanged → no commit).
 * Work happens on the `dev` branch; `main` only ever receives merges from `dev`.
 */

export const STEPS = ["repo", "editor_config", "brief", "claude_md", "assets", "prompt", "editor_registry"] as const;
export type StepName = (typeof STEPS)[number];
export type StepResult = { ok: boolean; at: string; detail?: string; error?: string };
/** `editor_registry` needs the private editor-config repo; its failure does not block the project (only the editor switch-on). */
const BLOCKING: StepName[] = ["repo", "editor_config", "brief", "claude_md", "assets", "prompt"];

const EDITOR_URL = "https://uredi.inzenirji.si";
const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/\.{2,}/g, ".").replace(/^\.+/, "").slice(0, 80) || "datoteka";

export type KickoffDeps = { gh: Gh; now?: () => Date; readFile?: (rel: string) => Promise<Buffer> };

export async function runKickoff(db: Db, id: string, deps: KickoffDeps, opts: { refreshBrief?: boolean } = {}): Promise<{ ok: boolean; steps: Record<string, StepResult> }> {
  const now = deps.now ?? (() => new Date());
  const read = deps.readFile ?? readStored;
  const cfg = await getSitesConfig(db);
  const [s0] = await db.select().from(siteProjects).where(eq(siteProjects.id, id)).limit(1);
  if (!s0) throw new Error("SITE_NOT_FOUND");
  if (s0.registered) throw new Error("SITE_REGISTERED_READONLY");
  const steps = { ...(s0.steps as Record<string, StepResult>) };
  const repo = s0.siteId;
  const full = `${cfg.owner}/${repo}`;
  const save = async (patch: Partial<typeof siteProjects.$inferInsert> = {}) => db.update(siteProjects).set({ steps, updatedAt: now(), ...patch }).where(eq(siteProjects.id, id));

  const run = async (name: StepName, fn: () => Promise<string>, force = false) => {
    if (steps[name]?.ok && !force) return;
    try {
      const detail = await fn();
      steps[name] = { ok: true, at: now().toISOString(), detail };
    } catch (e) {
      steps[name] = { ok: false, at: now().toISOString(), error: e instanceof Error ? e.message : "Neznana napaka" };
    }
    await save();
  };

  await run("repo", async () => {
    const r = await deps.gh.createFromTemplate(cfg.templateRepo, repo);
    await deps.gh.ensureBranch(repo, "dev", "main");
    await save({ repoFullName: full });
    return r.created ? `Repozitorij ${full} ustvarjen iz predloge.` : `Repozitorij ${full} že obstaja, uporabljen.`;
  });
  const repoOk = steps.repo?.ok === true;
  const blocked = (name: StepName, fn: () => Promise<string>, force = false) =>
    repoOk ? run(name, fn, force) : Promise.resolve((steps[name] = { ok: false, at: now().toISOString(), error: "Čaka na repozitorij." }));

  await blocked("editor_config", async () => {
    const [s] = await db.select().from(siteProjects).where(eq(siteProjects.id, id));
    const input = (await loadBriefInput(db, id, now()))!;
    const cur = await deps.gh.getFile(repo, "editor.config.json", "dev");
    let enabled = false;
    try {
      enabled = cur ? (JSON.parse(cur.content) as { enabled?: boolean }).enabled === true : false;
    } catch {
      /* template file unreadable: start disabled */
    }
    const conf = {
      siteId: repo,
      siteName: input.company.name,
      repo: full,
      branches: { dev: "dev", main: "main" },
      urls: { live: s!.domain ? `https://${s!.domain}` : `https://${repo}.pages.dev`, dev: `https://${repo}-dev.pages.dev` },
      editorUrl: EDITOR_URL,
      guideVersion: cfg.guideVersion,
      enabled,
    };
    const r = await deps.gh.putFile(repo, "editor.config.json", `${JSON.stringify(conf, null, 2)}\n`, "chore: editor config from CRM kickoff", "dev");
    await save({ guideVersion: cfg.guideVersion });
    return r.changed ? "editor.config.json zapisan." : "editor.config.json je že pravi.";
  });

  await blocked(
    "brief",
    async () => {
      const [s] = await db.select().from(siteProjects).where(eq(siteProjects.id, id));
      const version = s!.briefVersion + 1;
      const input = await loadBriefInput(db, id, now());
      const md = buildBrief({ ...input!, version, assets: await assetList(db, s!.projectId) });
      const r = await deps.gh.putFile(repo, "BRIEF.md", md, `docs: brief v${version} from CRM`, "dev");
      await save({ briefVersion: version });
      return r.changed ? `BRIEF.md v${version} zapisan.` : `BRIEF.md ni spremenjen.`;
    },
    opts.refreshBrief,
  );

  await blocked("claude_md", async () => {
    const input = (await loadBriefInput(db, id, now()))!;
    const cur = await deps.gh.getFile(repo, "CLAUDE.md", "dev");
    if (!cur) throw new Error("V repozitoriju ni CLAUDE.md (predloga je pokvarjena).");
    const next = fillClaudeMd(cur.content, input);
    const r = await deps.gh.putFile(repo, "CLAUDE.md", next, "docs: client section in CLAUDE.md", "dev");
    return r.changed ? "CLAUDE.md dopolnjen." : "CLAUDE.md je že pravi.";
  });

  await blocked("assets", async () => {
    const [s] = await db.select().from(siteProjects).where(eq(siteProjects.id, id));
    const files = s!.projectId ? await db.select().from(projectFiles).where(eq(projectFiles.projectId, s!.projectId)).orderBy(asc(projectFiles.createdAt)) : [];
    const rows: string[] = ["| Datoteka | Vir | Opomba o pravicah |", "|---|---|---|"];
    let copied = 0;
    const used = new Set<string>();
    for (const f of files) {
      let name = safeName(f.name);
      for (let n = 2; used.has(name); n++) name = `${n}-${safeName(f.name)}`;
      used.add(name);
      const data = await read(f.path);
      const r = await deps.gh.putFile(repo, `brief/assets/${name}`, data, `docs: asset ${name}`, "dev");
      if (r.changed) copied++;
      rows.push(`| ${name} | stranka (obrazec za materiale) | stranka jamči za pravice; preveri pred objavo |`);
    }
    if (!files.length) rows.push("| (ni datotek) | | |");
    await deps.gh.putFile(repo, "brief/assets/INDEX.md", `# Assets\n\n${rows.join("\n")}\n`, "docs: assets index", "dev");
    return `${files.length} datotek (${copied} novih).`;
  });

  await blocked("prompt", async () => {
    if (!cfg.siteGuideUrl) throw new Error("V Nastavitvah › Izdelava strani vpiši povezavo do navodil (siteGuideUrl).");
    const [s] = await db.select().from(siteProjects).where(eq(siteProjects.id, id));
    const input = (await loadBriefInput(db, id, now()))!;
    const prompt = buildKickoffPrompt({ siteId: repo, companyName: input.company.name, repoFullName: full, kind: s!.kind as "client" | "migration" | "own", guideUrl: cfg.siteGuideUrl, hasCgp: s!.hasCgp });
    await save({ kickoffPrompt: prompt });
    return "Poziv za Claude pripravljen.";
  });

  await blocked("editor_registry", async () => {
    const [s] = await db.select().from(siteProjects).where(eq(siteProjects.id, id));
    const input = (await loadBriefInput(db, id, now()))!;
    const meta = { siteId: repo, name: input.company.name, repo: full, live: s!.domain ? `https://${s!.domain}` : `https://${repo}.pages.dev`, dev: `https://${repo}-dev.pages.dev`, kind: s!.kind };
    if (!(await deps.gh.repoExists(cfg.editorConfigRepo))) throw new Error(`Repozitorij ${cfg.editorConfigRepo} še ne obstaja (ustvari ga, ko vklopiš urejevalnik).`);
    const a = await deps.gh.putFile(cfg.editorConfigRepo, `sites/${repo}/site.json`, `${JSON.stringify(meta, null, 2)}\n`, `chore: register site ${repo}`, "main");
    const b = await deps.gh.putFile(cfg.editorConfigRepo, `sites/${repo}/editors.json`, `${JSON.stringify(s!.editors, null, 2)}\n`, `chore: editors of ${repo}`, "main");
    return a.changed || b.changed ? "Stran vpisana med urejevalnike." : "Vpis že pravi.";
  });

  const ok = BLOCKING.every((n) => steps[n]?.ok === true);
  const [cur] = await db.select({ stage: siteProjects.stage }).from(siteProjects).where(eq(siteProjects.id, id));
  await save(ok && cur?.stage === "setup" ? { stage: "brief_ready" } : {});
  return { ok, steps };
}

async function assetList(db: Db, projectId: string | null) {
  if (!projectId) return [];
  const files = await db.select({ name: projectFiles.name }).from(projectFiles).where(eq(projectFiles.projectId, projectId)).orderBy(asc(projectFiles.createdAt));
  return files.map((f) => ({ name: safeName(f.name), source: "naložila stranka" }));
}

/** Starts the kickoff as a background job (one at a time per site). */
export async function startKickoff(db: Db, id: string, deps: KickoffDeps, opts: { refreshBrief?: boolean } = {}): Promise<{ ok: true; jobId: string } | { ok: false; message: string }> {
  const [s] = await db.select({ companyId: siteProjects.companyId, registered: siteProjects.registered }).from(siteProjects).where(eq(siteProjects.id, id)).limit(1);
  if (!s) return { ok: false, message: "Strani ni." };
  if (s.registered) return { ok: false, message: "To je registrirana obstoječa stran: CRM ne ustvarja ničesar v njenem repozitoriju." };
  if (await runningJob(db, ["site_kickoff"], s.companyId)) return { ok: false, message: "Priprava že teče, počakaj minuto." };
  const jobId = await startJob(db, { kind: "site_kickoff", companyId: s.companyId }, async () => {
    const r = await runKickoff(db, id, deps, opts);
    const bad = Object.entries(r.steps).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.error}`);
    if (!r.ok) return `Priprava ni končana: ${bad.join(" | ")}`;
    return bad.length ? `Pripravljeno (opozorilo: ${bad.join(" | ")})` : "Paket za izdelavo strani je pripravljen.";
  });
  return { ok: true, jobId };
}
