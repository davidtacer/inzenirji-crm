import { describe, expect, it } from "vitest";
import { FetchBlockedError, isPrivateIp, safeFetch } from "./safe-fetch";

describe("isPrivateIp", () => {
  it("blocks private, loopback, link-local and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["91.99.191.8", "8.8.8.8", "172.32.0.1", "2a01:4f8::1"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
});

const page = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe("safeFetch", () => {
  it("fetches a public page and follows a redirect", async () => {
    const seen: string[] = [];
    const fake = (async (u: URL) => {
      seen.push(u.toString());
      return u.protocol === "http:" ? new Response(null, { status: 301, headers: { location: "https://salon.si/" } }) : page("<html>ok</html>");
    }) as unknown as typeof fetch;
    const r = await safeFetch("http://salon.si", { resolve: async () => ["91.99.191.8"], fetchImpl: fake });
    expect(seen).toEqual(["http://salon.si/", "https://salon.si/"]);
    expect(r).toMatchObject({ finalUrl: "https://salon.si/", status: 200, html: "<html>ok</html>", redirects: 1, https: true });
  });

  it("refuses private targets, also behind a redirect", async () => {
    await expect(safeFetch("http://localhost/", { resolve: async () => ["127.0.0.1"] })).rejects.toThrow("FETCH_BLOCKED_PRIVATE_IP");
    const fake = (async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } })) as unknown as typeof fetch;
    const e = await safeFetch("https://evil.si", { resolve: async (h) => (h === "evil.si" ? ["8.8.8.8"] : []), fetchImpl: fake }).catch((x) => x);
    expect(e).toBeInstanceOf(FetchBlockedError);
    expect(e.reason).toBe("PRIVATE_IP");
  });

  it("refuses odd protocols, ports and credentials", async () => {
    const r = async () => ["8.8.8.8"];
    await expect(safeFetch("file:///etc/passwd", { resolve: r })).rejects.toThrow("PROTOCOL");
    await expect(safeFetch("http://salon.si:5432/", { resolve: r })).rejects.toThrow("PORT");
    await expect(safeFetch("http://a:b@salon.si/", { resolve: r })).rejects.toThrow("CREDENTIALS");
  });

  it("stops reading at the size limit", async () => {
    const fake = (async () => page("x".repeat(5000))) as unknown as typeof fetch;
    const r = await safeFetch("https://salon.si", { resolve: async () => ["8.8.8.8"], fetchImpl: fake, maxBytes: 1000 });
    expect(r.html.length).toBeLessThanOrEqual(1000);
  });
});
