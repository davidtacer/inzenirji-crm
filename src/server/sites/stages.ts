/*
 * Stages of a site project and who may move it (TASK-039 §4). The agent works forward through MCP up to
 * `design_draft`; `design_approved` is the owner's gate and can never be set over MCP.
 */

export const STAGES = ["setup", "brief_ready", "cgp", "research", "design_draft", "design_approved", "building", "preview_ready", "handed_over"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  setup: "Priprava",
  brief_ready: "Brief pripravljen",
  cgp: "CGP",
  research: "Raziskava trga",
  design_draft: "Osnutek dizajna",
  design_approved: "Dizajn odobren",
  building: "Izdelava",
  preview_ready: "Predogled pripravljen",
  handed_over: "Predano",
};

export type Actor = "owner" | "agent";

/** Stages the agent may report. Not `setup` (CRM only) and not `design_approved` (owner only). */
const AGENT_STAGES: Stage[] = ["cgp", "research", "design_draft", "building", "preview_ready"];

export function canMove(from: Stage, to: Stage, actor: Actor): { ok: true } | { ok: false; message: string } {
  if (from === to) return { ok: true };
  const a = STAGES.indexOf(from);
  const b = STAGES.indexOf(to);
  if (to === "design_approved" && actor !== "owner") return { ok: false, message: "Dizajn lahko odobri samo lastnik v CRM-ju." };
  if (actor === "agent" && !AGENT_STAGES.includes(to)) return { ok: false, message: `Agent ne sme nastaviti faze ${to}.` };
  if (from === "setup" && actor === "agent") return { ok: false, message: "Priprava (kickoff) še ni končana." };
  if (b < a) return actor === "owner" ? { ok: true } : { ok: false, message: "Agent se ne vrača nazaj; prosi lastnika." };
  // Forward: one step at a time; the agent may skip cgp/research (client has a CGP) but only up to design_draft.
  if (b !== a + 1 && !(actor === "agent" && b <= STAGES.indexOf("design_draft"))) return { ok: false, message: to === "building" ? "Izdelava se začne šele po odobritvi dizajna." : `Faze ne moreš preskočiti (${from} → ${to}).` };
  return { ok: true };
}
