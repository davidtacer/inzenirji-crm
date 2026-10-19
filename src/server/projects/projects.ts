import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, companies, contacts, deals, drafts, inboundMessages, projectFiles, projectPauses, projects, proposals } from "../db/schema";
import { setStage } from "../calls/calls";
import { MATERIALS } from "../calls/calls";
import { totals, type Item } from "../proposals/proposals";
import type { Settings } from "../settings";
import { checkUpload, removeStored, saveFile } from "./storage";

/*
 * Projects (TASK-014, ADR-033). Created when the owner marks the prepayment as received. Guarantee rules (ADR-010,
 * spec §8): the clock starts when the confirmation e-mail is sent, pauses while we wait for the client, deadline =
 * start + timeline days + paused time.
 */

export type Material = { label: string; done: boolean; text: string; doneAt: string | null };

const DAY = 86_400_000;

/** Owner: prepayment received → deal won + project (materials from the accepted proposal). Idempotent. */
export async function startProject(db: Db, companyId: string, st: Settings, now = new Date()): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const [d] = await db.select().from(deals).where(eq(deals.companyId, companyId)).limit(1);
  if (!d) return { ok: false, message: "Podjetje nima posla." };
  const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.dealId, d.id)).limit(1);
  if (existing) return { ok: true, id: existing.id };
  const [p] = await db.select().from(proposals).where(and(eq(proposals.dealId, d.id), eq(proposals.status, "accepted"))).orderBy(desc(proposals.acceptedAt)).limit(1);
  const list = ((p?.materials as string[] | undefined)?.length ? (p!.materials as string[]) : [...MATERIALS]).map((label) => ({ label, done: false, text: "", doneAt: null }));
  const deposit = p ? totals(p.items as Item[], p.vatRateBp, st.vatPayer, p.depositPct).deposit : null;
  const err = await setStage(db, companyId, { stage: "won" }, now);
  if (err) return { ok: false, message: err };
  const [row] = await db
    .insert(projects)
    .values({ dealId: d.id, proposalId: p?.id ?? null, token: randomBytes(18).toString("base64url"), materials: list, timelineDays: p?.timelineDays ?? 7, depositCents: deposit, depositPaidAt: now })
    .returning({ id: projects.id });
  await db.insert(activities).values({ dealId: d.id, type: "note", at: now, payload: { projectStarted: row.id, depositCents: deposit } });
  return { ok: true, id: row.id };
}

export type Clock = { started: boolean; deadline: Date | null; pausedMs: number; paused: boolean; daysLeft: number | null };

/** Guarantee clock (pure, testable). */
export function clock(p: { confirmedAt: Date | null; timelineDays: number; launchedAt: Date | null }, pauses: { startAt: Date; endAt: Date | null }[], now = new Date()): Clock {
  if (!p.confirmedAt) return { started: false, deadline: null, pausedMs: 0, paused: false, daysLeft: null };
  const end = p.launchedAt ?? now;
  let pausedMs = 0;
  let paused = false;
  for (const x of pauses) {
    if (x.startAt < p.confirmedAt) continue;
    const e = x.endAt ?? end;
    if (!x.endAt) paused = true;
    pausedMs += Math.max(0, e.getTime() - x.startAt.getTime());
  }
  const deadline = new Date(p.confirmedAt.getTime() + p.timelineDays * DAY + pausedMs);
  return { started: true, deadline, pausedMs, paused, daysLeft: Math.ceil((deadline.getTime() - end.getTime()) / DAY) };
}

export async function getProject(db: Db, id: string) {
  const [r] = await db
    .select({ p: projects, companyId: companies.id, companyName: companies.name, dealId: deals.id })
    .from(projects)
    .innerJoin(deals, eq(deals.id, projects.dealId))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(eq(projects.id, id))
    .limit(1);
  if (!r) return null;
  const pauses = await db.select().from(projectPauses).where(eq(projectPauses.projectId, id)).orderBy(asc(projectPauses.startAt));
  const files = await db.select().from(projectFiles).where(eq(projectFiles.projectId, id)).orderBy(asc(projectFiles.createdAt));
  return { ...r, pauses, files, clock: clock(r.p, pauses) };
}

export async function projectByToken(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [r] = await db.select({ id: projects.id }).from(projects).where(eq(projects.token, token)).limit(1);
  return r ? getProject(db, r.id) : null;
}

export async function listProjects(db: Db) {
  const rows = await db
    .select({ p: projects, companyId: companies.id, companyName: companies.name })
    .from(projects)
    .innerJoin(deals, eq(deals.id, projects.dealId))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(sql`${projects.status} <> 'cancelled'`)
    .orderBy(desc(projects.createdAt));
  const pauses = rows.length ? await db.select().from(projectPauses).where(inArray(projectPauses.projectId, rows.map((r) => r.p.id))) : [];
  return rows.map((r) => ({ ...r, clock: clock(r.p, pauses.filter((x) => x.projectId === r.p.id)) }));
}

/** Client: text for an item and/or files; an item with text or a file counts as submitted. */
export async function submitItem(
  db: Db,
  token: string,
  index: number,
  input: { text: string; files: { name: string; type: string; size: number; data: Buffer }[] },
  now = new Date(),
): Promise<string | null> {
  const proj = await projectByToken(db, token);
  if (!proj) return "Projekta ni.";
  if (proj.p.status !== "materials") return "Materiali so že potrjeni — za spremembe nam pišite.";
  const mats = proj.p.materials as Material[];
  if (!Number.isInteger(index) || index < 0 || index >= mats.length) return "Neveljavna postavka.";
  for (const f of input.files) {
    const e = checkUpload(f);
    if (e) return e;
  }
  if (proj.files.length + input.files.length > 200) return "Preveč datotek — pošljite ZIP ali nam pišite.";
  for (const f of input.files) {
    const rel = await saveFile(proj.p.id, f.data, f.name);
    await db.insert(projectFiles).values({ projectId: proj.p.id, itemIndex: index, name: f.name.slice(0, 200), mime: f.type, size: f.size, path: rel });
  }
  const text = input.text.trim().slice(0, 10_000);
  const hasFiles = input.files.length > 0 || proj.files.some((f) => f.itemIndex === index);
  const next = mats.map((m, i) => (i === index ? { ...m, text: text || m.text, done: hasFiles || !!(text || m.text), doneAt: now.toISOString() } : m));
  await db.update(projects).set({ materials: next, updatedAt: now }).where(eq(projects.id, proj.p.id));
  return null;
}

export async function deleteFile(db: Db, token: string, fileId: string): Promise<string | null> {
  const proj = await projectByToken(db, token);
  if (!proj || proj.p.status !== "materials") return "Ni mogoče.";
  const f = proj.files.find((x) => x.id === fileId);
  if (!f) return "Datoteke ni.";
  await db.delete(projectFiles).where(eq(projectFiles.id, f.id));
  await removeStored(f.path);
  const mats = proj.p.materials as Material[];
  const left = proj.files.filter((x) => x.itemIndex === f.itemIndex && x.id !== f.id).length;
  const next = mats.map((m, i) => (i === f.itemIndex ? { ...m, done: left > 0 || !!m.text } : m));
  await db.update(projects).set({ materials: next }).where(eq(projects.id, proj.p.id));
  return null;
}

/** Owner can tick an item himself (e.g. received by e-mail). */
export async function setItemDone(db: Db, projectId: string, index: number, done: boolean, now = new Date()) {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p) return;
  const mats = (p.materials as Material[]).map((m, i) => (i === index ? { ...m, done, doneAt: done ? now.toISOString() : null } : m));
  await db.update(projects).set({ materials: mats, updatedAt: now }).where(eq(projects.id, projectId));
}

async function recipient(db: Db, dealId: string) {
  const [d] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
  const [lastIn] = await db
    .select({ messageId: inboundMessages.messageId, from: inboundMessages.fromEmail, subject: inboundMessages.subject })
    .from(inboundMessages)
    .where(and(eq(inboundMessages.companyId, d.companyId), eq(inboundMessages.direction, "in")))
    .orderBy(desc(inboundMessages.receivedAt))
    .limit(1);
  const [c] = await db.select({ email: contacts.email }).from(contacts).where(and(eq(contacts.companyId, d.companyId), sql`${contacts.email} is not null and ${contacts.invalidAt} is null`)).limit(1);
  return { to: lastIn?.from ?? c?.email ?? null, inReplyTo: lastIn?.messageId ?? null, subject: lastIn?.subject ? (/^re:/i.test(lastIn.subject) ? lastIn.subject : `Re: ${lastIn.subject}`) : null };
}

const SIG = "Lp,\nDavid\ninženirji.si";
const fmtDay = (d: Date) => d.toLocaleDateString("sl-SI", { timeZone: "Europe/Ljubljana", weekday: "long", day: "numeric", month: "numeric", year: "numeric" });

export function projectUrl(token: string, appUrl = process.env.APP_URL ?? "https://crm.inzenirji.si") {
  return `${appUrl}/projekt/${token}`;
}

/** E-mail with the upload link (right after the prepayment) or a reminder listing what is missing. */
export async function materialsEmail(db: Db, projectId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p) return { ok: false, message: "Projekta ni." };
  const r = await recipient(db, p.dealId);
  if (!r.to) return { ok: false, message: "Podjetje nima e-naslova." };
  const missing = (p.materials as Material[]).filter((m) => !m.done).map((m) => `- ${m.label}`);
  const first = (p.materials as Material[]).every((m) => !m.done);
  const body = first
    ? `Pozdravljeni,\n\nhvala za predplačilo, začenjamo! Materiale za stran lahko oddate tukaj:\n${projectUrl(p.token)}\n\nPotrebujemo:\n${missing.join("\n")}\n\nKo prejmemo vse, vam pisno potrdim in stran je na spletu v ${p.timelineDays} dneh.\n\n${SIG}`
    : `Pozdravljeni,\n\nza začetek nam manjka še:\n${missing.join("\n")}\n\nOddate jih lahko tukaj: ${projectUrl(p.token)}\n\nKo prejmemo vse, začne teči ${p.timelineDays}-dnevni rok.\n\n${SIG}`;
  if (!missing.length) return { ok: false, message: "Vsi materiali so oddani — uporabi »Vse prejeto«." };
  const [dr] = await db
    .insert(drafts)
    .values({ dealId: p.dealId, kind: "reply", toEmail: r.to.toLowerCase(), subject: r.subject ?? "Materiali za vašo spletno stran", body, inReplyTo: r.inReplyTo, purpose: "materials", refId: p.id })
    .onConflictDoNothing()
    .returning({ id: drafts.id });
  return dr ? { ok: true } : { ok: false, message: "Odprt osnutek odgovora že obstaja — uredi ga v Osnutkih." };
}

/** "Vse prejeto": confirmation e-mail with the deadline; sending it starts the clock (onDraftSent). */
export async function confirmationEmail(db: Db, projectId: string, now = new Date()): Promise<{ ok: true } | { ok: false; message: string }> {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p) return { ok: false, message: "Projekta ni." };
  if (p.confirmedAt) return { ok: false, message: "Rok že teče." };
  const r = await recipient(db, p.dealId);
  if (!r.to) return { ok: false, message: "Podjetje nima e-naslova." };
  const deadline = new Date(now.getTime() + p.timelineDays * DAY);
  const body = `Pozdravljeni,\n\nprejeli smo vse potrebno - hvala! Vaša nova spletna stran bo na spletu najkasneje do ${fmtDay(deadline)}.\n\nČe bomo med izdelavo kaj potrebovali od vas, vam pišem; takrat rok miruje, dokler ne odgovorite.\n\n${SIG}`;
  const [dr] = await db
    .insert(drafts)
    .values({ dealId: p.dealId, kind: "reply", toEmail: r.to.toLowerCase(), subject: r.subject ?? "Prejeli smo vse - vaša stran je v izdelavi", body, inReplyTo: r.inReplyTo, purpose: "project_confirm", refId: p.id })
    .onConflictDoNothing()
    .returning({ id: drafts.id });
  return dr ? { ok: true } : { ok: false, message: "Odprt osnutek odgovora že obstaja — uredi ga v Osnutkih." };
}

/** Called from sendApprovedDraft after a successful send. */
export async function onDraftSent(db: Db, draft: { purpose: string | null; refId: string | null }, now: Date) {
  if (draft.purpose === "project_confirm" && draft.refId) {
    await db
      .update(projects)
      .set({ confirmedAt: now, status: "in_progress", updatedAt: now })
      .where(and(eq(projects.id, draft.refId), isNull(projects.confirmedAt)));
  }
}

export async function pauseProject(db: Db, id: string, reason: string, now = new Date()): Promise<string | null> {
  if (reason.trim().length < 3) return "Vpiši razlog (npr. čakam na besedila za podstran Storitve).";
  const [p] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!p?.confirmedAt) return "Rok še ne teče.";
  const r = await db.insert(projectPauses).values({ projectId: id, startAt: now, reason: reason.trim().slice(0, 300) }).onConflictDoNothing().returning({ id: projectPauses.id });
  return r.length ? null : "Rok je že ustavljen.";
}

export async function resumeProject(db: Db, id: string, now = new Date()) {
  await db.update(projectPauses).set({ endAt: now }).where(and(eq(projectPauses.projectId, id), isNull(projectPauses.endAt)));
}

export async function launchProject(db: Db, id: string, now = new Date()) {
  await resumeProject(db, id, now);
  await db.update(projects).set({ launchedAt: now, status: "launched", updatedAt: now }).where(eq(projects.id, id));
}

export async function finalPaid(db: Db, id: string, now = new Date()) {
  await db.update(projects).set({ finalPaidAt: now, updatedAt: now }).where(eq(projects.id, id));
}
