/** Lower-case, trimmed e-mail, or null when it does not look like an address. */
export function normalizeEmail(input: string | null | undefined): string | null {
  const e = input?.trim().toLowerCase();
  if (!e) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Host of a website or e-mail domain: lower-case, without "www.", without port. Null when unusable. */
export function domainOf(input: string | null | undefined): string | null {
  const raw = input?.trim().toLowerCase();
  if (!raw) return null;
  let host: string;
  if (raw.includes("@") && !raw.includes("/")) {
    host = raw.split("@").pop() ?? "";
  } else {
    if (/\s/.test(raw)) return null;
    try {
      host = new URL(/^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}
