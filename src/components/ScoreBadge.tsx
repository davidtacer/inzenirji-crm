/** Lead score 0–100 (TASK-007). Green ≥ 60, yellow 40–59, grey below. */
export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="font-mono text-xs text-text-secondary">—</span>;
  const tone = score >= 60 ? "border-accent text-accent" : score >= 40 ? "border-[#F0B429] text-[#F0B429]" : "border-border text-text-secondary";
  return <span className={`inline-block min-w-[2.5rem] border px-1.5 py-0.5 text-center font-mono text-xs font-bold ${tone}`}>{score}</span>;
}
