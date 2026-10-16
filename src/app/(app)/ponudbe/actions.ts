"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/settings";
import { createProposal, proposalEmail, updateProposal } from "@/server/proposals/proposals";
import { startProject } from "@/server/projects/projects";

export type ActionState = { ok: boolean; message: string } | null;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

export async function newProposalAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = form.get("companyId");
  if (!isId(id)) return { ok: false, message: "Neveljavno podjetje." };
  const db = getDb();
  const p = await createProposal(db, id, await getSettings(db));
  if (!p) return { ok: false, message: "Podjetje nima posla." };
  redirect(`/ponudbe/${p.id}`);
}

export async function saveProposalAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = form.get("id");
  if (!isId(id)) return { ok: false, message: "Neveljavna ponudba." };
  const f = (k: string) => String(form.get(k) ?? "");
  const err = await updateProposal(getDb(), id, {
    title: f("title"),
    intro: f("intro"),
    items: f("items"),
    timelineDays: f("timelineDays"),
    depositPct: f("depositPct"),
    materials: f("materials"),
    validUntil: f("validUntil"),
  });
  revalidatePath(`/ponudbe/${id}`);
  revalidatePath("/ponudbe");
  return err ? { ok: false, message: err } : { ok: true, message: "Shranjeno." };
}

export async function emailProposalAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = form.get("id");
  if (!isId(id)) return { ok: false, message: "Neveljavna ponudba." };
  const db = getDb();
  const r = await proposalEmail(db, id, await getSettings(db));
  for (const p of [`/ponudbe/${id}`, "/ponudbe", "/osnutki", "/klici", "/"]) revalidatePath(p);
  return r.ok ? { ok: true, message: "E-mail s povezavo čaka v Osnutkih — preglej in pošlji." } : r;
}

export async function paidAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const companyId = form.get("companyId");
  if (!isId(companyId)) return { ok: false, message: "Neveljavno podjetje." };
  const db = getDb();
  const r = await startProject(db, companyId, await getSettings(db));
  for (const p of ["/ponudbe", "/klici", "/", "/projekti", `/podjetja/${companyId}`]) revalidatePath(p);
  if (!r.ok) return r;
  redirect(`/projekti/${r.id}`);
}
