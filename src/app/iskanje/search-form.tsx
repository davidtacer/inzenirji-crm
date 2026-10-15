"use client";
import { useActionState } from "react";
import { searchAction, type SearchState } from "./actions";

export function SearchForm() {
  const [state, action, pending] = useActionState<SearchState, FormData>(searchAction, null);
  return (
    <form action={action} className="flex flex-col gap-3 border border-border bg-surface p-6 md:flex-row md:items-end">
      <label className="flex flex-1 flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Panoga in kraj</span>
        <input
          name="query"
          required
          minLength={3}
          maxLength={100}
          placeholder="npr. frizerski salon Celje"
          className="border border-border bg-base px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Strani (po 20)</span>
        <select name="pages" defaultValue="1" className="border border-border bg-base px-3 py-2 font-mono text-sm text-text-primary">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="border border-accent bg-accent px-5 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60"
      >
        {pending ? "Iščem…" : "> Išči"}
      </button>
      {state ? (
        <p role="status" className={`basis-full font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>
          &gt; {state.message}
        </p>
      ) : null}
    </form>
  );
}
