import { describe, expect, it } from "vitest";
import { cleanReply, contactOptionsFromEnv, nextStep } from "./reply";

describe("nextStep", () => {
  it("booking link first, then phone, else ask for their number", () => {
    expect(nextStep({ bookingUrl: "https://cal.app/x", phone: "041 111 222" })).toContain("https://cal.app/x");
    expect(nextStep({ bookingUrl: null, phone: "041 111 222" })).toBe("Pokličite me na 041 111 222 ali mi pošljite svojo številko in vas pokličem jaz.");
    expect(nextStep({ bookingUrl: null, phone: null })).toBe("Pošljite mi svojo telefonsko številko in kdaj vam najbolj ustreza, pa vas pokličem.");
    expect(contactOptionsFromEnv({ BOOKING_URL: " ", OWNER_PHONE: "041 1" })).toEqual({ bookingUrl: null, phone: "041 1" });
  });
});

describe("cleanReply", () => {
  const o = { bookingUrl: null, phone: "041 111 222" };
  it("strips the model's signature and dashes; requires the contact option", () => {
    expect(cleanReply("Pozdravljeni,\n\nsuper — pokličite me na 041 111 222.\n\nLp,\nDavid", "interested", "A", o)).toBe("Pozdravljeni,\n\nsuper - pokličite me na 041 111 222.");
    expect(cleanReply("Pozdravljeni,\n\nkdaj vam ustreza?", "interested", "A", o)).toBeNull();
    expect(cleanReply("Pozdravljeni,\n\nhvala, oglasim se spomladi.", "not_now", "A", o)).toBe("Pozdravljeni,\n\nhvala, oglasim se spomladi.");
  });
  it("no price for group A, must start with the greeting", () => {
    expect(cleanReply("Pozdravljeni,\n\nprenos stane 900 €. 041 111 222", "question", "A", o)).toBeNull();
    expect(cleanReply("Pozdravljeni,\n\nnova stran je 590 € + DDV. 041 111 222", "question", "B", o)).not.toBeNull();
    expect(cleanReply("Živjo!", "question", "B", o)).toBeNull();
  });
});
