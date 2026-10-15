import { GROUP_HELP, GROUP_LABEL } from "@/lib/labels";

/** Short reminder what the groups mean (owner request 2026-10-15). */
export function GroupLegend() {
  return (
    <div className="mb-4 grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-2">
      {(["A", "B"] as const).map((g) => (
        <p key={g} className="bg-surface px-4 py-3 font-sans text-xs text-text-secondary">
          <span className="mr-2 font-mono text-[11px] text-accent">{GROUP_LABEL[g]}</span>
          {GROUP_HELP[g]}
        </p>
      ))}
    </div>
  );
}
