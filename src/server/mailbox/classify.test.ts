import { describe, expect, it } from "vitest";
import { classifyByRules, classifyReply, ownText, type InboundMail } from "./classify";
import { toInbound } from "./imap";

const mail = (over: Partial<InboundMail>): InboundMail => ({
  messageId: "<x@y>",
  from: "ana@salon.si",
  subject: "Re: Spletna stran za Salon Ana",
  text: "",
  date: new Date("2026-10-20T10:00:00Z"),
  inReplyTo: null,
  references: [],
  autoSubmitted: null,
  ...over,
});

describe("ownText", () => {
  it("cuts quoted history", () => {
    expect(ownText("Zanima me.\nLp Ana\n\nOn Mon, David wrote:\n> Pozdravljeni")).toBe("Zanima me.\nLp Ana");
    expect(ownText("Ne.\n\nDne 20. 10. 2026 je David napisal:\nx")).toBe("Ne.");
  });
});

describe("classifyByRules", () => {
  it("bounce, out of office, no / odjava; otherwise undecided", () => {
    expect(classifyByRules(mail({ from: "MAILER-DAEMON@mx.si", subject: "Undelivered Mail Returned to Sender" }))).toBe("bounce");
    expect(classifyByRules(mail({ subject: "Samodejni odgovor: Spletna stran" }))).toBe("out_of_office");
    expect(classifyByRules(mail({ autoSubmitted: "auto-replied" }))).toBe("out_of_office");
    expect(classifyByRules(mail({ text: "Ne, hvala.\n\n> citat" }))).toBe("no");
    expect(classifyByRules(mail({ subject: "odjava" }))).toBe("no");
    expect(classifyByRules(mail({ text: "Ne vem še, koliko bi stalo?" }))).toBeNull();
  });
});

describe("classifyReply", () => {
  it("AI decides the rest; without AI or on error → question", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"class": "interested"}' }], usage: { input_tokens: 100, output_tokens: 5 } }), { status: 200 })) as unknown as typeof fetch;
    const ai = { apiKey: "K", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 1e6, fetchImpl };
    expect(await classifyReply(mail({ text: "Pokličite me jutri." }), ai)).toMatchObject({ cls: "interested", by: "claude-haiku-5-5" });
    expect((await classifyReply(mail({ text: "Pokličite me jutri." }), null)).cls).toBe("question");
    const broken = { ...ai, fetchImpl: (async () => new Response("", { status: 500 })) as unknown as typeof fetch };
    expect(await classifyReply(mail({ text: "x y z" }), broken)).toMatchObject({ cls: "question", by: "default" });
  });
});

describe("toInbound", () => {
  it("parses a raw message with threading and auto-submitted headers", async () => {
    const raw = Buffer.from(
      [
        "From: Ana Novak <Ana@Salon.si>",
        "To: david@inzenirji.si",
        "Subject: Re: Spletna stran",
        "Message-ID: <abc@salon.si>",
        "In-Reply-To: <11111111-2222-3333-4444-555555555555@inzenirji.si>",
        "References: <11111111-2222-3333-4444-555555555555@inzenirji.si>",
        "Auto-Submitted: no",
        "Date: Tue, 20 Oct 2026 10:00:00 +0200",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Zanima me, pokličite.",
      ].join("\r\n"),
    );
    const m = await toInbound(raw);
    expect(m).toMatchObject({
      messageId: "<abc@salon.si>",
      from: "Ana@Salon.si",
      subject: "Re: Spletna stran",
      inReplyTo: "<11111111-2222-3333-4444-555555555555@inzenirji.si>",
      references: ["<11111111-2222-3333-4444-555555555555@inzenirji.si>"],
      autoSubmitted: "no",
    });
    expect(m!.text.trim()).toBe("Zanima me, pokličite.");
  });
});
