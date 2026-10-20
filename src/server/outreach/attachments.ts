import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { draftAttachments, drafts } from "../db/schema";
import { checkUpload, readStored, removeStored, saveFile } from "../projects/storage";

/*
 * Attachments on outgoing e-mails (owner 2026-10-20: "Pri emailih potrebujem, da lahko dodajam priponke").
 * Files go on the same upload volume as client materials (ADR-033), under drafts/<draftId>/. Allowed only while the
 * draft is not sent; the total is kept under 15 MB so the e-mail (base64 adds a third) stays below the 25 MB that
 * Gmail and most servers accept.
 */

export const MAX_DRAFT_ATTACH_BYTES = 15 * 1024 * 1024;
export const MAX_DRAFT_ATTACH_FILES = 5;

export type NewFile = { name: string; type: string; size: number; data: Buffer };
export type AttachmentRow = { id: string; draftId: string; name: string; mime: string; size: number };

export async function addAttachments(db: Db, draftId: string, files: NewFile[], dir?: string): Promise<{ ok: boolean; message: string }> {
  const [d] = await db.select({ status: drafts.status }).from(drafts).where(eq(drafts.id, draftId)).limit(1);
  if (!d) return { ok: false, message: "Osnutka ni." };
  if (d.status !== "pending" && d.status !== "approved") return { ok: false, message: "E-mail je že poslan ali zavržen." };
  const real = files.filter((f) => f.size > 0);
  if (!real.length) return { ok: false, message: "Izberi vsaj eno datoteko." };
  for (const f of real) {
    const bad = checkUpload(f);
    if (bad) return { ok: false, message: bad };
  }
  const existing = await db.select({ size: draftAttachments.size }).from(draftAttachments).where(eq(draftAttachments.draftId, draftId));
  if (existing.length + real.length > MAX_DRAFT_ATTACH_FILES) return { ok: false, message: `Največ ${MAX_DRAFT_ATTACH_FILES} priponk na e-mail.` };
  const total = existing.reduce((a, r) => a + r.size, 0) + real.reduce((a, f) => a + f.size, 0);
  if (total > MAX_DRAFT_ATTACH_BYTES) return { ok: false, message: "Priponke skupaj ne smejo biti večje od 15 MB." };
  for (const f of real) {
    const path = await saveFile(`drafts/${draftId}`, f.data, f.name, dir);
    await db.insert(draftAttachments).values({ draftId, name: f.name.slice(0, 200), mime: f.type, size: f.size, path });
  }
  return { ok: true, message: real.length === 1 ? `Pripeto: ${real[0]!.name}` : `Pripetih datotek: ${real.length}` };
}

export async function removeAttachment(db: Db, id: string, dir?: string): Promise<boolean> {
  const [a] = await db
    .select({ path: draftAttachments.path, status: drafts.status })
    .from(draftAttachments)
    .innerJoin(drafts, eq(drafts.id, draftAttachments.draftId))
    .where(eq(draftAttachments.id, id))
    .limit(1);
  if (!a || a.status === "sent") return false;
  await db.delete(draftAttachments).where(eq(draftAttachments.id, id));
  await removeStored(a.path, dir);
  return true;
}

export async function attachmentsFor(db: Db, draftIds: string[]): Promise<Record<string, AttachmentRow[]>> {
  if (!draftIds.length) return {};
  const rows = await db
    .select({ id: draftAttachments.id, draftId: draftAttachments.draftId, name: draftAttachments.name, mime: draftAttachments.mime, size: draftAttachments.size })
    .from(draftAttachments)
    .where(inArray(draftAttachments.draftId, draftIds))
    .orderBy(asc(draftAttachments.createdAt));
  const out: Record<string, AttachmentRow[]> = {};
  for (const r of rows) (out[r.draftId] ??= []).push(r);
  return out;
}

/** The files for sending; a file missing on disk stops the send (never send without what the owner attached). */
export async function attachmentsForSend(db: Db, draftId: string, dir?: string) {
  const rows = await db.select().from(draftAttachments).where(and(eq(draftAttachments.draftId, draftId))).orderBy(asc(draftAttachments.createdAt));
  const out: { filename: string; content: Buffer; contentType: string }[] = [];
  for (const r of rows) out.push({ filename: r.name, content: await readStored(r.path, dir), contentType: r.mime });
  return out;
}

export const sizeLabel = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);
