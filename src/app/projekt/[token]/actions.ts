"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { deleteFile, submitItem } from "@/server/projects/projects";

export type ItemState = { ok: boolean; message: string } | null;

/** Public: the client submits text and/or files for one material (the token in the link is the access). */
export async function submitItemAction(_prev: ItemState, form: FormData): Promise<ItemState> {
  const token = String(form.get("token") ?? "");
  const index = Number(form.get("index"));
  const files = form.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f && f.size > 0);
  const err = await submitItem(getDb(), token, index, {
    text: String(form.get("text") ?? ""),
    files: await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, size: f.size, data: Buffer.from(await f.arrayBuffer()) }))),
  });
  revalidatePath(`/projekt/${token}`);
  return err ? { ok: false, message: err } : { ok: true, message: files.length ? `Oddano (${files.length} datotek). Hvala!` : "Shranjeno. Hvala!" };
}

export async function deleteFileAction(_prev: ItemState, form: FormData): Promise<ItemState> {
  const token = String(form.get("token") ?? "");
  const err = await deleteFile(getDb(), token, String(form.get("fileId") ?? ""));
  revalidatePath(`/projekt/${token}`);
  return err ? { ok: false, message: err } : { ok: true, message: "Odstranjeno." };
}
