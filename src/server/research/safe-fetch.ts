import { lookup } from "node:dns/promises";
import net from "node:net";

/*
 * Fetching arbitrary company websites from our shared server (TASK-006). Guards against SSRF: only http(s),
 * only public IPs (checked for every hop of a redirect chain), bounded time and size.
 * Residual risk: DNS rebinding between our lookup and fetch's own lookup; acceptable for an owner-only tool that
 * fetches public business sites, documented in docs/technical/research.md.
 */

export class FetchBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`FETCH_BLOCKED_${reason}`);
  }
}

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const inV4 = (ip: string, cidr: string) => {
  const [base, bits] = cidr.split("/");
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
};
const PRIVATE_V4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
  "192.0.0.0/24", "192.168.0.0/16", "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4",
];

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return PRIVATE_V4.some((c) => inV4(ip, c));
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
  }
  return true;
}

export type Resolver = (host: string) => Promise<string[]>;
export const dnsResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

async function assertPublicUrl(raw: string, resolve: Resolver): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchBlockedError("BAD_URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchBlockedError("PROTOCOL");
  if (u.username || u.password) throw new FetchBlockedError("CREDENTIALS");
  if (u.port && u.port !== "80" && u.port !== "443") throw new FetchBlockedError("PORT");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = net.isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (ips.length === 0) throw new FetchBlockedError("DNS");
  if (ips.some(isPrivateIp)) throw new FetchBlockedError("PRIVATE_IP");
  return u;
}

export type FetchedPage = { finalUrl: string; status: number; html: string; ms: number; redirects: number; https: boolean };

export async function safeFetch(
  url: string,
  opts: { resolve?: Resolver; fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {},
): Promise<FetchedPage> {
  const resolve = opts.resolve ?? dnsResolver;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    let current = url;
    for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
      const u = await assertPublicUrl(current, resolve);
      const res = await fetchImpl(u, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "InzenirjiCRM/1.0 (+https://www.inzenirji.si)", Accept: "text/html,*/*;q=0.5" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, u).toString();
        continue;
      }
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
      return { finalUrl: u.toString(), status: res.status, html, ms: Date.now() - started, redirects: hop, https: u.protocol === "https:" };
    }
    throw new FetchBlockedError("TOO_MANY_REDIRECTS");
  } finally {
    clearTimeout(timer);
  }
}
