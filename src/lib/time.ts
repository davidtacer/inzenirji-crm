/** Europe/Ljubljana helpers (TASK-012). The CRM shows and takes times in the owner's local time. */

export const TZ = "Europe/Ljubljana";

function offsetMinutes(at: Date): number {
  const part = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** "2026-10-20T14:30" (datetime-local, Ljubljana time) → Date; null when invalid. */
export function fromLocalInput(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Offset at that wall time (DST-safe enough for business hours).
  const guess = new Date(asUtc - offsetMinutes(new Date(asUtc)) * 60_000);
  return new Date(asUtc - offsetMinutes(guess) * 60_000);
}

/** Date → "2026-10-20T14:30" in Ljubljana time, for datetime-local defaults. */
export function toLocalInput(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function formatLj(d: Date | null | undefined, withTime = true): string {
  if (!d) return "—";
  return d.toLocaleString("sl-SI", withTime ? { timeZone: TZ, weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" } : { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" });
}

/** Tomorrow 10:00 Ljubljana time, as the default for a new call. */
export function defaultCallInput(now = new Date()): string {
  return `${toLocalInput(new Date(now.getTime() + 86_400_000)).slice(0, 10)}T10:00`;
}

export function isPast(d: Date | null | undefined, now = new Date()): boolean {
  return !!d && d.getTime() < now.getTime();
}

export function within(d: Date | null | undefined, hours: number, now = new Date()): boolean {
  return !!d && d.getTime() < now.getTime() + hours * 3600_000;
}
