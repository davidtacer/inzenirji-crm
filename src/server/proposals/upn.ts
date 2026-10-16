import QRCode from "qrcode";

/*
 * UPN QR (Slovenian payment QR, ZBS standard) for the prepayment (TASK-013, ADR-031).
 * 19 fields + checksum, each followed by "\n", ISO-8859-2, QR version 15, error correction M.
 * Fields 2–11 (payer side) stay empty: the client's bank fills them.
 */

export type UpnInput = {
  amountCents: number;
  purpose: string;
  dueDate: Date;
  iban: string;
  reference: string;
  name: string;
  street: string;
  city: string;
};

const ISO_8859_2: Record<string, number> = { č: 0xe8, Č: 0xc8, š: 0xb9, Š: 0xa9, ž: 0xbe, Ž: 0xae, ć: 0xe6, Ć: 0xc6, đ: 0xf0, Đ: 0xd0 };

export function toLatin2(s: string): Uint8Array {
  return Uint8Array.from([...s].map((ch) => ISO_8859_2[ch] ?? (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 0x3f)));
}

const cut = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export function upnText(u: UpnInput): string {
  const d = u.dueDate;
  const due = `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
  const fields = [
    "UPNQR",
    "", // IBAN plačnika
    "", // polog
    "", // dvig
    "", // referenca plačnika
    "", // ime plačnika
    "", // ulica plačnika
    "", // kraj plačnika
    String(Math.round(u.amountCents)).padStart(11, "0"),
    "", // datum plačila
    "", // nujno
    "OTHR",
    cut(u.purpose, 42),
    due,
    u.iban.replace(/\s+/g, "").toUpperCase(),
    cut(u.reference, 26),
    cut(u.name, 33),
    cut(u.street, 33),
    cut(u.city, 33),
  ];
  const body = fields.map((f) => `${f}\n`).join("");
  const checksum = String(body.length).padStart(3, "0");
  return `${body}${checksum}\n`;
}

export async function upnQrSvg(u: UpnInput): Promise<string> {
  return QRCode.toString([{ data: toLatin2(upnText(u)), mode: "byte" }], { type: "svg", errorCorrectionLevel: "M", version: 15, margin: 2 });
}
