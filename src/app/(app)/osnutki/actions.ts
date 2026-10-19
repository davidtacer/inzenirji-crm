"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { createOutreachMailerFromEnv } from "@/server/email/mailer";
import {
  addContactEmail,
  approveDraft,
  blockCompany,
  createFirstDraft,
  createFirstDrafts,
  discardDraft,
  DRAFT_REASON,
  markReplied,
  unapproveDraft,
} from "@/server/outreach/drafts";
import { outreachConfig, SEND_REASON, sendApprovedDraft } from "@/server/outreach/send";
import { getSettings } from "@/server/settings";
import { topLeads } from "@/server/scoring/apply";
import { importCompanyHistory } from "@/server/mailbox/sync";
import { aiConfig } from "@/server/ai/remark";

export type ActionState = { ok: boolean; message: string } | null;

const EXPIRED: ActionState = { ok: false, message: "Prijava je potekla. Osveži stran." };
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

function refresh(companyId?: string) {
  revalidatePath("/osnutki");
  revalidatePath("/");
  revalidatePath("/podjetja");
  if (companyId) revalidatePath(`/podjetja/${companyId}`);
}

export async function approveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("id");
  if (!isId(id)) return { ok: false, message: "Neveljaven osnutek." };
  try {
    const ok = await approveDraft(getDb(), id, { subject: String(form.get("subject") ?? ""), body: String(form.get("body") ?? ""), toEmail: form.get("toEmail") ? String(form.get("toEmail")) : null });
    refresh();
    return ok ? { ok: true, message: "Odobreno." } : { ok: false, message: "Osnutek ni več v čakanju." };
  } catch (e) {
    if (e instanceof Error && e.message === "DRAFT_BAD_RECIPIENT") return { ok: false, message: "Tega e-naslova ni med veljavnimi naslovi podjetja." };
    if (e instanceof Error && e.message === "DRAFT_PLACEHOLDER") return { ok: false, message: "Najprej zamenjaj [TUKAJ ODGOVORI NA VPRAŠANJE] s svojim odgovorom." };
    return { ok: false, message: "Zadeva in besedilo ne smeta biti prazna." };
  }
}

export async function discardAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("id");
  if (!isId(id)) return { ok: false, message: "Neveljaven osnutek." };
  const ok = await discardDraft(getDb(), id);
  refresh();
  return ok ? { ok: true, message: "Zavrženo." } : { ok: false, message: "Osnutka ni bilo mogoče zavreči." };
}

export async function unapproveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("id");
  if (!isId(id)) return { ok: false, message: "Neveljaven osnutek." };
  const ok = await unapproveDraft(getDb(), id);
  refresh();
  return ok ? { ok: true, message: "Vrnjeno v urejanje." } : { ok: false, message: "Ni mogoče." };
}

export async function sendAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("id");
  if (!isId(id)) return { ok: false, message: "Neveljaven osnutek." };
  const config = outreachConfig(await getSettings(getDb()));
  if (!config.enabled) return { ok: false, message: SEND_REASON.LOCKED };
  const r = await sendApprovedDraft(getDb(), id, { mailer: createOutreachMailerFromEnv(), config });
  refresh();
  return r.ok ? { ok: true, message: "Poslano." } : { ok: false, message: SEND_REASON[r.error] };
}

export async function draftOneAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("companyId");
  if (!isId(id)) return { ok: false, message: "Neveljavno podjetje." };
  const r = await createFirstDraft(getDb(), id, aiConfig(await getSettings(getDb())));
  refresh(id);
  return r.ok ? { ok: true, message: "Osnutek je pripravljen — najdeš ga v »Osnutki«." } : { ok: false, message: DRAFT_REASON[r.reason] };
}

export async function draftTopAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  if (!(await getCurrentUser())) return EXPIRED;
  const db = getDb();
  const top = await topLeads(db, 10);
  const r = await createFirstDrafts(db, top.map((t) => t.id), aiConfig(await getSettings(db)));
  refresh();
  const why = Object.entries(r.skipped)
    .map(([k, n]) => `${n}× ${DRAFT_REASON[k as keyof typeof DRAFT_REASON].replace(/\.$/, "").toLowerCase()}`)
    .join(", ");
  return { ok: r.created > 0, message: `Pripravljenih osnutkov: ${r.created}.${why ? ` Preskočeno: ${why}.` : ""}` };
}

export async function addEmailAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("companyId");
  if (!isId(id)) return { ok: false, message: "Neveljavno podjetje." };
  const r = await addContactEmail(getDb(), id, String(form.get("email") ?? ""), String(form.get("source") ?? ""));
  if (r.ok) {
    const h = await importCompanyHistory(getDb(), id);
    if (h.ok && h.inbound + h.sent) r.message += ` Uvoženih e-mailov iz nabiralnika: ${h.inbound + h.sent}.`;
  }
  refresh(id);
  return r;
}

export async function repliedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("companyId");
  if (!isId(id)) return { ok: false, message: "Neveljavno podjetje." };
  await markReplied(getDb(), id);
  refresh(id);
  return { ok: true, message: "Označeno: odgovoril. Nadaljnji follow-upi so ustavljeni." };
}

export async function blockAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("companyId");
  if (!isId(id)) return { ok: false, message: "Neveljavno podjetje." };
  if (form.get("confirm") !== "on") return { ok: false, message: "Za potrditev označi kvadratek." };
  const reason = String(form.get("reason") ?? "").trim() || "ne kontaktiraj (lastnik)";
  await blockCompany(getDb(), id, reason);
  refresh(id);
  return { ok: true, message: "Dodano na seznam »ne kontaktiraj« (trajno)." };
}
