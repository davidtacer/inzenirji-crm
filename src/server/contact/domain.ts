import { promises as dns } from "node:dns";

/*
 * Does the domain of an address accept mail? (owner 2026-10-21: frizerstvomojca-sp.si did not exist, ai.slop on the
 * form.) MX records, or an A/AAAA record (implicit MX). "unknown" on timeouts and other DNS errors: never block on
 * a failure of our own.
 */

export type DomainVerdict = "yes" | "no" | "unknown";
export type DomainCheck = (domain: string) => Promise<DomainVerdict>;

const GONE = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), ms))]);

export const realDomainCheck: DomainCheck = async (domain) => {
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 4000);
    // "Null MX" (RFC 7505): the domain says it takes no mail.
    if (mx.length && mx.every((r) => r.exchange === "" || r.exchange === ".")) return "no";
    if (mx.length) return "yes";
  } catch (e) {
    if (!GONE.has((e as { code?: string }).code ?? "")) return "unknown";
  }
  for (const resolve of [dns.resolve4, dns.resolve6]) {
    try {
      if ((await withTimeout(resolve(domain), 4000)).length) return "yes";
    } catch (e) {
      if (!GONE.has((e as { code?: string }).code ?? "")) return "unknown";
    }
  }
  return "no";
};

/** In tests nothing is looked up unless a test passes its own check. */
export const defaultDomainCheck: DomainCheck = process.env.VITEST ? async () => "unknown" : realDomainCheck;
