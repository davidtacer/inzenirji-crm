import QRCode from "qrcode";
import { encode } from "upnqr";

/*
 * UPN QR (Slovenian payment QR) for the prepayment (TASK-013, ADR-031). The data string comes from the `upnqr`
 * package (owner's choice, 2026-10-16, after our own encoder did not scan in Slovenian banks). The QR symbol follows
 * the ZBS standard: ISO-8859-2 bytes, version 15, error correction M.
 * The reference is written WITHOUT spaces (e.g. "SI0057308522"); it may be shown with a space on the page.
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
  return encode({
    znesek: Math.round(u.amountCents) / 100,
    koda_namena: "OTHR",
    namen_placila: cut(u.purpose, 42),
    rok_placila: u.dueDate,
    IBAN_prejemnika: u.iban.replace(/\s+/g, "").toUpperCase(),
    referenca_prejemnika: u.reference.replace(/\s+/g, "").toUpperCase().slice(0, 26),
    ime_prejemnika: cut(u.name, 33),
    ulica_prejemnika: cut(u.street, 33),
    kraj_prejemnika: cut(u.city, 33),
  });
}

export async function upnQrSvg(u: UpnInput): Promise<string> {
  return QRCode.toString([{ data: toLatin2(upnText(u)), mode: "byte" }], { type: "svg", errorCorrectionLevel: "M", version: 15, margin: 2 });
}
