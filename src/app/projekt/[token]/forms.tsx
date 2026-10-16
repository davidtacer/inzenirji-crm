"use client";
import { useActionState, useState } from "react";
import { deleteFileAction, submitItemAction, type ItemState } from "./actions";

const input = "w-full border border-[#222] bg-black px-3 py-2 font-sans text-sm text-[#EAEAEA] focus:border-[#00FF41] focus:outline-none";

export function ItemForm({ token, index, text, wantsText }: { token: string; index: number; text: string; wantsText: boolean }) {
  const [state, action, busy] = useActionState<ItemState, FormData>(submitItemAction, null);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="index" value={index} />
      {wantsText ? <textarea name="text" defaultValue={text} rows={3} placeholder="Vpišite ali prilepite tukaj …" className={input} /> : <input type="hidden" name="text" value={text} />}
      <label className="flex cursor-pointer flex-wrap items-center gap-3 font-mono text-xs text-[#888]">
        <span className="border border-[#222] px-3 py-1.5 text-[#EAEAEA] hover:border-[#00FF41]">+ Izberi datoteke</span>
        <span>{picked.length ? picked.join(", ") : "ni izbranih"}</span>
        <input
          type="file"
          name="files"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.ai,.eps,.svg"
          className="sr-only"
          onChange={(e) => setPicked([...(e.target.files ?? [])].map((f) => f.name))}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="border border-[#00FF41] bg-[#00FF41] px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-[#00FF41] disabled:opacity-60"
        >
          {busy ? "Nalagam…" : "> Oddaj"}
        </button>
        {state ? <span className={`font-mono text-xs ${state.ok ? "text-[#00FF41]" : "text-[#FF3B3B]"}`}>&gt; {state.message}</span> : null}
      </div>
    </form>
  );
}

export function RemoveFile({ token, fileId }: { token: string; fileId: string }) {
  const [, action, busy] = useActionState<ItemState, FormData>(deleteFileAction, null);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="fileId" value={fileId} />
      <button type="submit" disabled={busy} className="font-mono text-[10px] text-[#888] hover:text-[#FF3B3B]" title="Odstrani">
        ✕
      </button>
    </form>
  );
}
