import { and, asc, desc, eq, sql } from "drizzle-orm";
import { normalizeEmail } from "../contact/normalize";
import { createManualCompany } from "../companies/manual";
import type { Prefill } from "@/lib/prefill";
import type { Db } from "../db/client";
import { activities, audits, companies, competitorLinks, contacts, deals, projectFiles, projects, siteProjects } from "../db/schema";
import type { CallSummary } from "../calls/calls";
import type { Material } from "../projects/projects";
import type { BriefInput } from "./brief";
import { deriveSiteId, validSiteId } from "./siteId";
import { canMove, STAGES, type Actor, type Stage } from "./stages";

/* Site projects (TASK-039): create (entries A, B, C), read for the brief, move through the stages. */

export type SiteProject = typeof siteProjects.$inferSelect;
export type Kind = "client" | "migration" | "own";
export const LANG_RE = /^[a-z]{2}$/;

export type NewSiteInput = {
  /** Existing company, or `newCompany` to create one with the manual-entry logic (ADR-024). */
  companyId?: string;
  newCompany?: Prefill;
  kind: Kind;
  siteId?: string;
  domain?: string;
  currentUrl?: string;
  contact?: string;
  languages?: string[];
  features?: string;
  priceEur?: string;
  deadline?: string;
  hasCgp?: boolean;
  notes?: string;
  ownerNotes?: string;
  /** Required for a `client` site without a paid deposit (entry B / C). */
  startReason?: string;
  /** Entry A: the won project (deposit paid). */
  projectId?: string;
};

const hostOf = (v: string): string | null => {
  const s = v.trim();
  if (!s) return null;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

export async function createSiteProject(db: Db, i: NewSiteInput, now = new Date()): Promise<{ ok: true; id: string; siteId: string } | { ok: false; message: string }> {
  if (!["client", "migration", "own"].includes(i.kind)) return { ok: false, message: "Izberi vrsto strani." };
  const languages = (i.languages?.length ? i.languages : ["sl"]).map((l) => l.trim().toLowerCase());
  if (languages.some((l) => !LANG_RE.test(l)) || new Set(languages).size !== languages.length || languages.length > 8) return { ok: false, message: "Jeziki: dvočrkovne kode (sl, en), brez ponavljanja." };
  const domain = i.domain?.trim() ? hostOf(i.domain) : null;
  if (i.domain?.trim() && !domain) return { ok: false, message: "Domena ni veljavna (npr. vodniskuter.si)." };
  const currentUrl = i.currentUrl?.trim() ? (hostOf(i.currentUrl) ? (/^https?:\/\//i.test(i.currentUrl.trim()) ? i.currentUrl.trim() : `https://${i.currentUrl.trim()}`) : null) : null;
  if (i.currentUrl?.trim() && !currentUrl) return { ok: false, message: "Trenutna povezava ni veljavna." };
  let priceCents: number | null = null;
  if (i.priceEur?.trim()) {
    const n = Number(i.priceEur.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { ok: false, message: "Cena: število v evrih." };
    priceCents = Math.round(n * 100);
  }
  if (i.kind === "own") priceCents = null;
  if (i.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(i.deadline)) return { ok: false, message: "Rok: datum LLLL-MM-DD." };

  let companyId = i.companyId;
  if (!companyId) {
    if (!i.newCompany) return { ok: false, message: "Izberi podjetje ali vpiši novo." };
    const r = await createManualCompany(db, i.newCompany);
    if (!r.ok) return r;
    companyId = r.id;
  }
  const [co] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!co) return { ok: false, message: "Podjetja ni." };

  const siteId = (i.siteId?.trim() || deriveSiteId(domain ?? co.name)).toLowerCase();
  if (!validSiteId(siteId)) return { ok: false, message: "ID strani: 3–50 znakov, male črke, številke in -, brez ponavljanja pomišljajev." };
  const [dup] = await db.select({ id: siteProjects.id }).from(siteProjects).where(eq(siteProjects.siteId, siteId)).limit(1);
  if (dup) return { ok: false, message: `ID »${siteId}« že obstaja. Spremeni ga.` };

  let projectId: string | null = null;
  let depositPaid = false;
  if (i.projectId) {
    const [p] = await db.select({ id: projects.id, paid: projects.depositPaidAt }).from(projects).where(eq(projects.id, i.projectId)).limit(1);
    if (!p) return { ok: false, message: "Projekta ni." };
    projectId = p.id;
    depositPaid = !!p.paid;
  }
  const reason = (i.startReason ?? "").trim();
  if (i.kind === "client" && !depositPaid && reason.length < 3) return { ok: false, message: "Stranka brez prejetega predplačila: vpiši razlog, zakaj začnemo (npr. dogovor po telefonu)." };

  const [row] = await db
    .insert(siteProjects)
    .values({
      companyId: co.id, projectId, kind: i.kind, siteId, domain, currentUrl, contact: i.contact?.trim() || null, languages, features: i.features?.trim() || null,
      priceCents, deadline: i.deadline || null, hasCgp: !!i.hasCgp, notes: i.notes?.trim() || null, ownerNotes: i.ownerNotes?.trim() || null,
      startReason: i.kind === "client" && !depositPaid ? reason : null, editors: [], updatedAt: now,
    })
    .returning({ id: siteProjects.id });
  const [deal] = await db.select({ id: deals.id }).from(deals).where(eq(deals.companyId, co.id)).limit(1);
  if (deal) await db.insert(activities).values({ dealId: deal.id, type: "note", at: now, payload: { siteStarted: siteId, kind: i.kind, ...(reason ? { reason } : {}) } });
  return { ok: true, id: row!.id, siteId };
}

export async function getSite(db: Db, id: string) {
  const [r] = await db
    .select({ s: siteProjects, companyName: companies.name })
    .from(siteProjects)
    .innerJoin(companies, eq(companies.id, siteProjects.companyId))
    .where(eq(siteProjects.id, id))
    .limit(1);
  return r ?? null;
}

export async function getSiteBySiteId(db: Db, siteId: string) {
  const [r] = await db.select({ id: siteProjects.id }).from(siteProjects).where(eq(siteProjects.siteId, siteId)).limit(1);
  return r ? getSite(db, r.id) : null;
}

export async function listSites(db: Db) {
  return db
    .select({ s: siteProjects, companyName: companies.name })
    .from(siteProjects)
    .innerJoin(companies, eq(companies.id, siteProjects.companyId))
    .orderBy(desc(siteProjects.createdAt));
}

/** Updates the editable facts before the repo exists (site id is locked afterwards). */
export async function updateSiteFacts(db: Db, id: string, i: Partial<Pick<NewSiteInput, "domain" | "contact" | "features" | "deadline" | "notes" | "ownerNotes" | "hasCgp">> & { languages?: string[]; editors?: { email: string; role: "owner" | "editor" }[] }, now = new Date()): Promise<string | null> {
  const patch: Partial<typeof siteProjects.$inferInsert> = { updatedAt: now };
  if (i.domain !== undefined) {
    const d = i.domain.trim() ? hostOf(i.domain) : null;
    if (i.domain.trim() && !d) return "Domena ni veljavna.";
    patch.domain = d;
  }
  if (i.contact !== undefined) patch.contact = i.contact.trim() || null;
  if (i.features !== undefined) patch.features = i.features.trim() || null;
  if (i.notes !== undefined) patch.notes = i.notes.trim() || null;
  if (i.ownerNotes !== undefined) patch.ownerNotes = i.ownerNotes.trim() || null;
  if (i.deadline !== undefined) patch.deadline = i.deadline || null;
  if (i.hasCgp !== undefined) patch.hasCgp = i.hasCgp;
  if (i.languages) {
    if (!i.languages.length || i.languages.some((l) => !LANG_RE.test(l))) return "Jeziki: dvočrkovne kode.";
    patch.languages = i.languages;
  }
  if (i.editors) {
    const seen = new Set<string>();
    const out: { email: string; role: "owner" | "editor" }[] = [];
    for (const e of i.editors) {
      const em = normalizeEmail(e.email);
      if (!em) return `E-naslov urednika ni veljaven: ${e.email}`;
      if (seen.has(em)) continue;
      seen.add(em);
      out.push({ email: em, role: e.role === "owner" ? "owner" : "editor" });
    }
    patch.editors = out;
  }
  await db.update(siteProjects).set(patch).where(eq(siteProjects.id, id));
  return null;
}

const LINK_KEYS = /^(design|preview|live|dev|cgp|other)$/;

function mergeLinks(cur: Record<string, string>, add: Record<string, string>): { ok: true; links: Record<string, string> } | { ok: false; message: string } {
  const out = { ...cur };
  for (const [k, v] of Object.entries(add)) {
    if (!LINK_KEYS.test(k)) return { ok: false, message: `Neznana povezava: ${k}.` };
    if (!/^https:\/\/[^\s]{3,300}$/.test(v)) return { ok: false, message: `Povezava ${k} mora biti https://…` };
    out[k] = v;
  }
  return { ok: true, links: out };
}

/** Owner: store links (live, dev, preview, design) without touching the stage or its note. */
export async function setLinks(db: Db, id: string, links: Record<string, string>, now = new Date()): Promise<string | null> {
  const [s] = await db.select({ links: siteProjects.links }).from(siteProjects).where(eq(siteProjects.id, id)).limit(1);
  if (!s) return "Strani ni.";
  const m = mergeLinks(s.links as Record<string, string>, links);
  if (!m.ok) return m.message;
  await db.update(siteProjects).set({ links: m.links, updatedAt: now }).where(eq(siteProjects.id, id));
  return null;
}

/** Stage change. `actor` decides what is allowed (the agent through MCP, the owner in the CRM). */
export async function moveStage(db: Db, id: string, to: Stage, actor: Actor, note: string, links: Record<string, string> = {}, now = new Date()): Promise<{ ok: true; stage: Stage } | { ok: false; message: string }> {
  if (!STAGES.includes(to)) return { ok: false, message: `Neznana faza: ${to}.` };
  const [s] = await db.select().from(siteProjects).where(eq(siteProjects.id, id)).limit(1);
  if (!s) return { ok: false, message: "Strani ni." };
  const ok = canMove(s.stage as Stage, to, actor);
  if (!ok.ok) return ok;
  const merged = mergeLinks(s.links as Record<string, string>, links);
  if (!merged.ok) return merged;
  const clean = merged.links;
  await db
    .update(siteProjects)
    .set({ stage: to, stageNote: note.trim().slice(0, 1000) || null, links: clean, updatedAt: now, ...(to === "design_approved" ? { approvedAt: now } : {}) })
    .where(eq(siteProjects.id, id));
  return { ok: true, stage: to };
}

/**
 * The ONLY place that reads data for BRIEF.md and the MCP `get_project`. It selects explicit columns: no score,
 * no owner notes, no drafts, no do-not-contact data (ADR-056).
 */
export async function loadBriefInput(db: Db, id: string, now = new Date()): Promise<BriefInput | null> {
  const r = await getSite(db, id);
  if (!r) return null;
  const s = r.s;
  const [c] = await db
    .select({ name: companies.name, category: companies.category, address: companies.address, city: companies.city, phone: companies.phone, website: companies.website })
    .from(companies)
    .where(eq(companies.id, s.companyId))
    .limit(1);
  const cs = await db
    .select({ name: contacts.name, email: contacts.email, phone: contacts.phone, role: contacts.role })
    .from(contacts)
    .where(and(eq(contacts.companyId, s.companyId), sql`${contacts.invalidAt} is null`))
    .orderBy(asc(contacts.createdAt));
  const [a] = await db.select({ issues: audits.issues, summary: audits.summary }).from(audits).where(eq(audits.companyId, s.companyId)).orderBy(desc(audits.createdAt)).limit(1);
  const comps = await db
    .select({ name: companies.name, website: companies.website, city: companies.city })
    .from(competitorLinks)
    .innerJoin(companies, eq(companies.id, competitorLinks.competitorId))
    .where(eq(competitorLinks.companyId, s.companyId))
    .orderBy(asc(competitorLinks.distanceM))
    .limit(10);
  const [d] = await db.select({ call: deals.callSummary }).from(deals).where(eq(deals.companyId, s.companyId)).limit(1);
  const cl = d?.call as CallSummary | null | undefined;
  let materials: { label: string; done: boolean }[] = [];
  let assets: { name: string; source: string }[] = [];
  if (s.projectId) {
    const [p] = await db.select({ materials: projects.materials }).from(projects).where(eq(projects.id, s.projectId)).limit(1);
    materials = ((p?.materials as Material[] | undefined) ?? []).map((m) => ({ label: m.label, done: m.done }));
    const files = await db.select({ name: projectFiles.name }).from(projectFiles).where(eq(projectFiles.projectId, s.projectId)).orderBy(asc(projectFiles.createdAt));
    assets = files.map((f) => ({ name: f.name, source: "naložila stranka" }));
  }
  const issues = ((a?.issues as { text?: string }[] | undefined) ?? []).map((x) => x.text ?? "").filter(Boolean);
  return {
    siteId: s.siteId, kind: s.kind as Kind, generatedAt: now.toISOString().slice(0, 16).replace("T", " ") + " UTC", version: s.briefVersion,
    company: c!, domain: s.domain, currentUrl: s.currentUrl, contact: s.contact,
    contacts: cs, languages: s.languages as string[], features: s.features, priceCents: s.priceCents, deadline: s.deadline, hasCgp: s.hasCgp, notes: s.notes,
    issues, researchSummary: a?.summary ?? null, competitors: comps,
    call: cl ? { summary: cl.summary, scope: cl.scope, wishes: cl.wishes, objections: cl.objections, nextStep: cl.nextStep } : null,
    materials, assets, editors: s.editors as { email: string; role: string }[], ga4: null,
  };
}
