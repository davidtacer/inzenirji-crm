/** Types for the `upnqr` package (UPN QR encode/decode, github.com/matjaz/upnqr). */
declare module "upnqr" {
  export type Upn = {
    polog?: boolean;
    dvig?: boolean;
    ime_placnika?: string;
    ulica_placnika?: string;
    kraj_placnika?: string;
    /** Euros, e.g. 359.9 */
    znesek: number;
    nujno?: boolean;
    koda_namena?: string;
    namen_placila?: string;
    rok_placila?: Date;
    IBAN_prejemnika: string;
    referenca_prejemnika?: string;
    ime_prejemnika?: string;
    ulica_prejemnika?: string;
    kraj_prejemnika?: string;
    rezerva?: string;
  };
  export function encode(upn: Upn): string;
  export function decode(code: string): Upn & { vsota: number };
}
