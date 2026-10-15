/** Parses a comma/space separated e-mail list (OWNER_EMAILS). Lower-cased, trimmed, de-duplicated. */
export function parseEmailList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  );
}

export function isOwner(email: string | null | undefined, owners: Set<string>): boolean {
  return !!email && owners.has(email.trim().toLowerCase());
}
