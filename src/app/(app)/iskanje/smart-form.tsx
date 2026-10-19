"use client";
import { useActionState } from "react";
import type { Activity, Region } from "@/server/places/catalog";
import { JobLine, type JobView } from "../podjetja/buttons";
import { type SearchState, smartSearchAction } from "./actions";

const field = "border border-border bg-base px-3 py-2 font-mono text-sm text-text-primary";

export function SmartSearchForm({ activities, regions, activity, town, job }: { activities: Activity[]; regions: Region[]; activity: string; town: string; job: JobView }) {
  const [state, action, pending] = useActionState<SearchState, FormData>(smartSearchAction, null);
  const running = job?.status === "running";
  return (
    <form action={action} className="flex flex-col gap-4 border border-accent/40 bg-surface p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Dejavnost</span>
          <select name="activity" defaultValue={activity} className={field}>
            {activities.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Kraj</span>
          <select name="town" defaultValue={town} className={field}>
            {regions.map((r) => (
              <optgroup key={r.key} label={r.label}>
                {r.towns.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Največ klicev</span>
          <select name="budget" defaultValue="10" className={field}>
            {[5, 10, 20, 40].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-3 font-sans text-sm text-text-primary">
        <input type="checkbox" name="nearby" className="h-4 w-4 accent-[#00FF41]" /> Tudi okoliški kraji (vsi kraji iste regije)
      </label>
      <p className="font-sans text-xs text-text-secondary">
        CRM sam išče z vsemi sopomenkami dejavnosti (npr. frizer, frizerka, barber), po delih večjih mest in po okoliških krajih. Kar je bilo iskano v zadnjih 90 dneh, preskoči. Drugo in tretjo stran prebere le, če prva prinese večinoma nova podjetja.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || running} className="border border-accent bg-accent px-5 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60">
          {pending || running ? "Iščem…" : "> Najdi nova podjetja"}
        </button>
        {job ? <JobLine job={job} label="Iskanje teče" /> : state ? <span className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</span> : null}
      </div>
    </form>
  );
}
