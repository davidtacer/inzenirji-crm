import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appJwt, normalizePem } from "./github";

const key = (type: "pkcs1" | "pkcs8") => generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type, format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;

describe("private key from copy and paste", () => {
  for (const type of ["pkcs1", "pkcs8"] as const) {
    const pem = key(type);
    const body = pem.split("\n").slice(1, -2);
    const head = pem.split("\n")[0]!;
    const tail = pem.trim().split("\n").at(-1)!;
    const variants: Record<string, string> = {
      original: pem,
      "CRLF": pem.replace(/\n/g, "\r\n"),
      "spaces instead of newlines": pem.trim().replace(/\n/g, " "),
      "one line, no separators in body": `${head}\n${body.join("")}\n${tail}`,
      "literal backslash-n": pem.trim().replace(/\n/g, "\\n"),
      "indented": pem.trim().split("\n").map((l) => `   ${l}`).join("\n"),
    };
    for (const [name, v] of Object.entries(variants)) {
      it(`${type}: ${name} signs a JWT`, () => {
        const n = normalizePem(v);
        expect(n).not.toBeNull();
        expect(appJwt({ appId: "1", privateKey: v }).split(".")).toHaveLength(3);
      });
    }
  }
  it("rejects things that are not private keys", () => {
    expect(normalizePem("hello")).toBeNull();
    expect(normalizePem("-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----")).toBeNull();
    expect(normalizePem("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----")).toBeNull();
  });
});
