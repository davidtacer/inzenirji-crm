import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { audits, companies, contacts, deals, projectFiles, projects, siteProjects } from "../db/schema";
import { handleRpc } from "../mcp/mcp";
import { buildBrief } from "./brief";
import { getSitesConfig, saveSitesConfig, validateSitesConfig } from "./config";
import { fakeGithub } from "./fakeGithub.testutil";
import { createGithub } from "./github";
import { runKickoff } from "./kickoff";
import { createSiteProject, getSite, loadBriefInput, moveStage } from "./store";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-sites-0123456789";

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, settings, jobs RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

const SECRET_NOTE = "OWNER-PRIVATE-NOTE-do-not-leak";

async function seedCompany() {
  const [c] = await db.insert(companies).values({ name: "Vodni skuter d.o.o.", category: "Najem plovil", city: "Koper", address: "Pristaniška 1, 6000 Koper", phone: "031 111 222", website: "https://vodniskuter.si", score: 87 }).returning({ id: companies.id });
  await db.insert(deals).values({ companyId: c!.id, source: "manual", valueCents: 99999 });
  await db.insert(contacts).values({ companyId: c!.id, email: "info@vodniskuter.si", emailSource: "https://vodniskuter.si", name: "Janez" });
  await db.insert(audits).values({ companyId: c!.id, issues: [{ code: "x", severity: "high", text: "Stran ni prilagojena telefonu." }], summary: "Stara stran, brez HTTPS." });
  return c!.id;
}

async function configured(gh = fakeGithub()) {
  await saveSitesConfig(db, { appId: "123", installationId: "456", owner: "owner", templateRepo: "inzenirji-site-template", editorConfigRepo: "inzenirji-editor-config", siteGuideUrl: "https://example.com/doc/secret/guide.md", guideVersion: "1.2" }, gh.privateKey);
  return gh;
}
const ghClient = (g: ReturnType<typeof fakeGithub>) => createGithub({ appId: "123", installationId: "456", owner: "owner", privateKey: g.privateKey }, g.fetchImpl);

describe("creating a site project", () => {
  it("entry C: new company by hand, no deposit, reason required for a client", async () => {
    const bad = await createSiteProject(db, { newCompany: { name: "Nova d.o.o.", address: "", city: "Celje", phone: "", email: "", emailSource: "", website: "", category: "" }, kind: "client", domain: "nova.si" });
    expect(bad).toMatchObject({ ok: false });
    const ok = await createSiteProject(db, { newCompany: { name: "Nova d.o.o.", address: "", city: "Celje", phone: "", email: "", emailSource: "", website: "", category: "" }, kind: "client", domain: "nova.si", startReason: "dogovor po telefonu" });
    expect(ok).toMatchObject({ ok: true, siteId: "nova-si" });
    expect((await db.select().from(companies)).length).toBe(1);
  });
  it("own and migration sites need no reason and own has no price", async () => {
    const id = await seedCompany();
    const r = await createSiteProject(db, { companyId: id, kind: "own", domain: "moja-stran.si", priceEur: "500" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((await getSite(db, r.id))!.s.priceCents).toBeNull();
  });
  it("site id must be unique and valid", async () => {
    const id = await seedCompany();
    expect((await createSiteProject(db, { companyId: id, kind: "own", domain: "a.si" })).ok).toBe(true);
    expect(await createSiteProject(db, { companyId: id, kind: "own", domain: "a.si" })).toMatchObject({ ok: false });
    expect(await createSiteProject(db, { companyId: id, kind: "own", siteId: "Bad_Id" })).toMatchObject({ ok: false });
    expect(await createSiteProject(db, { companyId: id, kind: "own", siteId: "ab" })).toMatchObject({ ok: false });
  });
  it("a client with no domain yet gets an id from the company name", async () => {
    const id = await seedCompany();
    const r = await createSiteProject(db, { companyId: id, kind: "migration" });
    expect(r).toMatchObject({ ok: true, siteId: "vodni-skuter-d-o-o" });
  });
});

describe("BRIEF.md exclusions (ADR-056)", () => {
  it("never contains score, deal value or owner-private notes", async () => {
    const cid = await seedCompany();
    const r = await createSiteProject(db, { companyId: cid, kind: "own", domain: "vodniskuter.si", ownerNotes: SECRET_NOTE, notes: "Ton: sproščen." });
    if (!r.ok) throw new Error(r.message);
    const md = buildBrief((await loadBriefInput(db, r.id))!);
    expect(md).toContain("Ton: sproščen.");
    expect(md).toContain("Stran ni prilagojena telefonu.");
    expect(md).not.toContain(SECRET_NOTE);
    expect(md).not.toMatch(/\b87\b/);
    expect(md).not.toContain("99999");
    expect(md).not.toContain("999,99");
  });
});

describe("kickoff job (mocked GitHub)", () => {
  async function site(extra: Partial<Parameters<typeof createSiteProject>[1]> = {}) {
    const cid = await seedCompany();
    const r = await createSiteProject(db, { companyId: cid, kind: "own", domain: "vodniskuter.si", notes: "Ton: sproščen.", ...extra });
    if (!r.ok) throw new Error(r.message);
    return r;
  }

  it("creates the repo and writes every file to dev; stage becomes brief_ready", async () => {
    const g = await configured();
    const s = await site();
    const out = await runKickoff(db, s.id, { gh: ghClient(g) });
    expect(out.ok).toBe(true);
    const row = (await getSite(db, s.id))!.s;
    expect(row.stage).toBe("brief_ready");
    expect(row.repoFullName).toBe("owner/vodniskuter-si");
    expect(g.repos.get("vodniskuter-si")?.private).toBe(true);
    const conf = JSON.parse(g.file("vodniskuter-si", "editor.config.json")!);
    expect(conf).toMatchObject({ siteId: "vodniskuter-si", enabled: false, guideVersion: "1.2", urls: { live: "https://vodniskuter.si", dev: "https://vodniskuter-si-dev.pages.dev" } });
    expect(g.file("vodniskuter-si", "BRIEF.md")).toContain("Vodni skuter d.o.o.");
    expect(g.file("vodniskuter-si", "CLAUDE.md")).toContain("## Client");
    expect(g.file("vodniskuter-si", "brief/assets/INDEX.md")).toContain("ni datotek");
    expect(JSON.parse(g.file("inzenirji-editor-config", "sites/vodniskuter-si/site.json", "main")!).repo).toBe("owner/vodniskuter-si");
    // Prompt: contains the guide URL; the guide URL is never written into the client repo.
    expect(row.kickoffPrompt).toContain("https://example.com/doc/secret/guide.md");
    for (const f of ["BRIEF.md", "CLAUDE.md", "editor.config.json", "brief/assets/INDEX.md"]) expect(g.file("vodniskuter-si", f)).not.toContain("example.com/doc/secret");
    expect(g.file("vodniskuter-si", "BRIEF.md", "main")).toBe("# BRIEF\n"); // main untouched
  });

  it("a failed step shows the reason and the retry creates no duplicates", async () => {
    const g = await configured();
    const s = await site();
    g.failOnce(/^PUT .*\/contents\/BRIEF\.md$/, 500);
    const first = await runKickoff(db, s.id, { gh: ghClient(g) });
    expect(first.ok).toBe(false);
    expect(first.steps.brief?.error).toContain("500");
    expect((await getSite(db, s.id))!.s.stage).toBe("setup");
    const generates = () => g.calls.filter((c) => c.endsWith("/generate")).length;
    expect(generates()).toBe(1);
    const second = await runKickoff(db, s.id, { gh: ghClient(g) });
    expect(second.ok).toBe(true);
    expect(generates()).toBe(1); // repo step was not repeated
    const putsAfterSecond = g.puts();
    const third = await runKickoff(db, s.id, { gh: ghClient(g) });
    expect(third.ok).toBe(true);
    expect(g.puts()).toBe(putsAfterSecond); // nothing re-committed
  });

  it("reuses a repo that already exists", async () => {
    const g = await configured();
    g.repos.set("vodniskuter-si", { private: true, branches: new Map([["main", new Map([["CLAUDE.md", Buffer.from("# x\n")]])], ["dev", new Map([["CLAUDE.md", Buffer.from("# x\n")]])]]) });
    const s = await site();
    const out = await runKickoff(db, s.id, { gh: ghClient(g) });
    expect(out.steps.repo?.detail).toContain("že obstaja");
    expect(g.calls.some((c) => c.endsWith("/generate"))).toBe(false);
  });

  it("fails clearly when the guide URL is not set, other steps still done", async () => {
    const g = fakeGithub();
    await saveSitesConfig(db, { appId: "123", installationId: "456", owner: "owner", templateRepo: "inzenirji-site-template", editorConfigRepo: "inzenirji-editor-config", siteGuideUrl: "", guideVersion: "1.2" }, g.privateKey);
    const s = await site();
    const out = await runKickoff(db, s.id, { gh: ghClient(g) });
    expect(out.ok).toBe(false);
    expect(out.steps.prompt?.error).toContain("siteGuideUrl");
    expect(out.steps.brief?.ok).toBe(true);
  });

  it("missing editor-config repo does not block brief_ready", async () => {
    const g = await configured();
    g.repos.delete("inzenirji-editor-config");
    const s = await site();
    const out = await runKickoff(db, s.id, { gh: ghClient(g) });
    expect(out.ok).toBe(true);
    expect(out.steps.editor_registry?.ok).toBe(false);
    expect((await getSite(db, s.id))!.s.stage).toBe("brief_ready");
  });

  it("copies client uploads into brief/assets (0 and many files)", async () => {
    const g = await configured();
    const cid = await seedCompany();
    const s = await createSiteProject(db, { companyId: cid, kind: "own", domain: "vodniskuter.si" });
    if (!s.ok) throw new Error(s.message);
    const out = await runKickoff(db, s.id, { gh: ghClient(g) });
    expect(out.steps.assets?.detail).toBe("0 datotek (0 novih).");
  });

  it("copies uploads of the linked project into brief/assets with an index (name collisions, 3 files)", async () => {
    const g = await configured();
    const cid = await seedCompany();
    const [d] = await db.select().from(deals);
    const [p] = await db.insert(projects).values({ dealId: d!.id, token: "t".repeat(24), materials: [{ label: "Logotip", done: true, text: "", doneAt: null }, { label: "Fotografije", done: false, text: "", doneAt: null }] }).returning({ id: projects.id });
    for (const [i, n] of ["logo.png", "logo.png", "../../etc/passwd"].entries()) await db.insert(projectFiles).values({ projectId: p!.id, itemIndex: 0, name: n, mime: "image/png", size: 3, path: `f${i}` });
    const s = await createSiteProject(db, { companyId: cid, kind: "client", domain: "vodniskuter.si", projectId: p!.id, startReason: "" }).catch(() => null);
    expect(s).toMatchObject({ ok: false }); // deposit not paid and no reason
    await db.update(projects).set({ depositPaidAt: new Date() }).where(eq(projects.id, p!.id));
    const r = await createSiteProject(db, { companyId: cid, kind: "client", domain: "vodniskuter.si", projectId: p!.id });
    if (!r.ok) throw new Error(r.message);
    const out = await runKickoff(db, r.id, { gh: ghClient(g), readFile: async (rel) => Buffer.from(`data-${rel}`) });
    expect(out.steps.assets?.detail).toBe("3 datotek (3 novih).");
    expect(g.file("vodniskuter-si", "brief/assets/logo.png")).toBe("data-f0");
    expect(g.file("vodniskuter-si", "brief/assets/2-logo.png")).toBe("data-f1");
    expect(g.file("vodniskuter-si", "brief/assets/_._etc_passwd")).toBe("data-f2");
    expect(g.file("vodniskuter-si", "brief/assets/INDEX.md")).toContain("logo.png");
    expect(g.file("vodniskuter-si", "BRIEF.md")).toContain("Manjka:\n- Fotografije");
  });

  it("keeps enabled=true of an already enabled editor on re-run", async () => {
    const g = await configured();
    const s = await site();
    await runKickoff(db, s.id, { gh: ghClient(g) });
    g.repos.get("vodniskuter-si")!.branches.get("dev")!.set("editor.config.json", Buffer.from(JSON.stringify({ enabled: true })));
    await db.update(siteProjects).set({ steps: {} });
    await runKickoff(db, s.id, { gh: ghClient(g) });
    expect(JSON.parse(g.file("vodniskuter-si", "editor.config.json")!).enabled).toBe(true);
  });
});

describe("MCP tools get_project / save_project_status", () => {
  const rpc = (name: string, args: Record<string, unknown>) => handleRpc(db, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { resolve: async () => ["93.184.216.34"], fetchImpl: fetch });
  const out = (r: unknown) => (r as { result: { isError?: boolean; content: { text: string }[] } }).result;

  async function ready() {
    const g = await configured();
    const cid = await seedCompany();
    const s = await createSiteProject(db, { companyId: cid, kind: "own", domain: "vodniskuter.si", ownerNotes: SECRET_NOTE });
    if (!s.ok) throw new Error(s.message);
    await runKickoff(db, s.id, { gh: ghClient(g) });
    return s;
  }

  it("get_project returns the brief without owner-private data", async () => {
    await ready();
    const r = out(await rpc("get_project", { site_id: "vodniskuter-si" }));
    const j = JSON.parse(r.content[0]!.text);
    expect(j.stage).toBe("brief_ready");
    expect(j.brief_markdown).toContain("Vodni skuter");
    expect(r.content[0]!.text).not.toContain(SECRET_NOTE);
    expect(r.content[0]!.text).not.toContain("kickoffPrompt");
  });

  it("agent reaches design_draft but can never set design_approved or building", async () => {
    await ready();
    expect(out(await rpc("save_project_status", { site_id: "vodniskuter-si", stage: "cgp", note: "CGP je gotov" })).isError).toBeUndefined();
    expect(out(await rpc("save_project_status", { site_id: "vodniskuter-si", stage: "design_draft", note: "osnutek", links: { design: "https://example.com/osnutek" } })).isError).toBeUndefined();
    const a = out(await rpc("save_project_status", { site_id: "vodniskuter-si", stage: "design_approved" }));
    expect(a.isError).toBe(true);
    const b = out(await rpc("save_project_status", { site_id: "vodniskuter-si", stage: "building" }));
    expect(b.isError).toBe(true);
    const row = (await db.select().from(siteProjects))[0]!;
    expect(row.stage).toBe("design_draft");
    expect(row.links).toMatchObject({ design: "https://example.com/osnutek" });
  });

  it("the owner approves, then the agent may build", async () => {
    const s = await ready();
    await moveStage(db, s.id, "cgp", "owner", "");
    await moveStage(db, s.id, "research", "owner", "");
    await moveStage(db, s.id, "design_draft", "owner", "");
    expect((await moveStage(db, s.id, "design_approved", "owner", "ok, všeč mi je")).ok).toBe(true);
    expect(out(await rpc("save_project_status", { site_id: "vodniskuter-si", stage: "building" })).isError).toBeUndefined();
  });

  it("rejects non-https links and unknown sites", async () => {
    await ready();
    expect(out(await rpc("save_project_status", { site_id: "vodniskuter-si", stage: "cgp", links: { design: "javascript:alert(1)" } })).isError).toBe(true);
    expect(out(await rpc("get_project", { site_id: "nope" })).isError).toBe(true);
  });
});

describe("settings card", () => {
  it("stores the private key encrypted and keeps it when the field is left empty", async () => {
    const g = fakeGithub();
    const base = { appId: "1", installationId: "2", owner: "owner", templateRepo: "t", editorConfigRepo: "e", siteGuideUrl: "", guideVersion: "1.2" };
    await saveSitesConfig(db, base, g.privateKey);
    const [row] = await admin`select value from settings where key = 'sitesConfig'`;
    expect(JSON.stringify(row!.value)).not.toContain("BEGIN");
    await saveSitesConfig(db, { ...base, appId: "9" }, null);
    expect(await getSitesConfig(db)).toMatchObject({ appId: "9", hasKey: true });
  });
  it("validates input", () => {
    const ok = { appId: "1", installationId: "2", owner: "owner", templateRepo: "t", editorConfigRepo: "e", siteGuideUrl: "https://x.si/a", guideVersion: "1.2" };
    expect(validateSitesConfig(ok).ok).toBe(true);
    expect(validateSitesConfig({ ...ok, appId: "abc" }).ok).toBe(false);
    expect(validateSitesConfig({ ...ok, siteGuideUrl: "http://x" }).ok).toBe(false);
    expect(validateSitesConfig({ ...ok, privateKey: "not a key" }).ok).toBe(false);
    expect(validateSitesConfig({ ...ok, guideVersion: "v1" }).ok).toBe(false);
  });
});
