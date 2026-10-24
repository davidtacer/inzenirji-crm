import { describe, expect, it } from "vitest";
import { canMove } from "./stages";

describe("site stages (TASK-039 §4)", () => {
  it("agent walks forward to design_draft, even skipping optional steps", () => {
    expect(canMove("brief_ready", "cgp", "agent").ok).toBe(true);
    expect(canMove("cgp", "research", "agent").ok).toBe(true);
    expect(canMove("brief_ready", "design_draft", "agent").ok).toBe(true); // existing CGP: cgp/research may be skipped
  });
  it("agent can never approve the design", () => {
    expect(canMove("design_draft", "design_approved", "agent")).toMatchObject({ ok: false });
    expect(canMove("design_draft", "design_approved", "owner").ok).toBe(true);
  });
  it("building starts only after approval", () => {
    expect(canMove("design_draft", "building", "agent")).toMatchObject({ ok: false });
    expect(canMove("design_draft", "building", "owner")).toMatchObject({ ok: false });
    expect(canMove("design_approved", "building", "agent").ok).toBe(true);
  });
  it("agent cannot set setup or handed_over and cannot go back", () => {
    expect(canMove("brief_ready", "setup", "agent")).toMatchObject({ ok: false });
    expect(canMove("preview_ready", "handed_over", "agent")).toMatchObject({ ok: false });
    expect(canMove("research", "cgp", "agent")).toMatchObject({ ok: false });
  });
  it("agent cannot report before the kickoff is finished", () => {
    expect(canMove("setup", "cgp", "agent")).toMatchObject({ ok: false });
  });
  it("owner may go back and hand over", () => {
    expect(canMove("building", "design_draft", "owner").ok).toBe(true);
    expect(canMove("preview_ready", "handed_over", "owner").ok).toBe(true);
  });
  it("jumping over the design gate is refused", () => {
    expect(canMove("research", "preview_ready", "agent")).toMatchObject({ ok: false });
    expect(canMove("research", "preview_ready", "owner")).toMatchObject({ ok: false });
  });
});
