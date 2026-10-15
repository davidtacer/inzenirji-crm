import { describe, expect, it } from "vitest";
import { addressKey, companyPageEmails, lookupBizi, parseResults, searchUrl } from "./bizi";

const RESULTS = `<div class="menu"><a href="https://www.bizi.si/TSMEDIA/">Iskanje po dejavnosti</a></div>
<div class="row"><a href="https://www.bizi.si/ANDREJ-GLUSIC-S-P/">ANDREJ GLUŠIČ s.p.</a><div>Gledališki trg 8</div><div>3000 Celje</div><div>Frizerska in brivska dejavnost</div></div>
<div class="row"><a href="https://www.bizi.si/NEGA-D-O-O-CELJE/">NEGA, d.o.o., Celje</a><div>Gledališki trg 8</div><div>3000 Celje</div></div>
<div class="row"><a href="/LUDA-D-O-O/">LUDA d.o.o.</a><div>Koritnice 31</div><div>6253 Knežak</div></div>
<div class="row"><a href="/ZINA-STRASEK-S-P/">ZINA STRAŠEK S.P.</a><div>Gledališki trg 18</div><div>3000 Celje</div></div>`;

describe("addressKey", () => {
  it("splits Google addresses", () => {
    expect(addressKey("Gosposka ulica 2, 3000 Celje, Slovenija")).toEqual({ street: "Gosposka ulica 2", token: "gosposka", number: "2", post: "3000", city: "Celje" });
    expect(addressKey("Cesta proletarskih brigad 79, 2000 Maribor, Slovenija")?.token).toBe("proletarskih");
    expect(addressKey("Zadobrova 40A, 3211 Škofja vas")?.number).toBe("40a");
    expect(addressKey("Celje, Slovenija")).toBeNull();
    expect(searchUrl(addressKey("Gosposka ulica 2, 3000 Celje, Slovenija")!)).toBe("https://www.bizi.si/iskanje?q=Gosposka%20ulica%202%20Celje");
  });
});

describe("parseResults", () => {
  it("keeps only results at the same street, number and post code", () => {
    const k = addressKey("Gledališki trg 8, 3000 Celje, Slovenija")!;
    expect(parseResults(RESULTS, k)).toEqual([
      { url: "https://www.bizi.si/ANDREJ-GLUSIC-S-P/", name: "ANDREJ GLUŠIČ s.p." },
      { url: "https://www.bizi.si/NEGA-D-O-O-CELJE/", name: "NEGA, d.o.o., Celje" },
    ]);
  });
});

describe("companyPageEmails", () => {
  it("takes the company's address, not the directory's own", () => {
    expect(companyPageEmails(`<a href="mailto:info@fizis.si">info@fizis.si</a> <a href="mailto:info@bizi.si">pišite nam</a>`)).toEqual(["info@fizis.si"]);
  });
});

describe("lookupBizi", () => {
  const pages: Record<string, string> = {
    "/iskanje": RESULTS,
    "/ANDREJ-GLUSIC-S-P/": `<p>041 111 222</p>`,
    "/NEGA-D-O-O-CELJE/": `<p>Gledališki trg 8, 3000 Celje 03 555 66 77</p><a href="mailto:nega@siol.net">nega@siol.net</a><a href="mailto:info@bizi.si">x</a>`,
  };
  const fake = (seen: string[]) =>
    (async (u: string) => {
      const p = new URL(String(u)).pathname;
      seen.push(p);
      return new Response(pages[p] ?? "", { status: pages[p] ? 200 : 404 });
    }) as unknown as typeof fetch;
  const resolve = async () => ["93.184.216.34"];

  it("two companies at one address: picks by name", async () => {
    const seen: string[] = [];
    const r = await lookupBizi({ name: "Frizerski salon Nega", address: "Gledališki trg 8, 3000 Celje, Slovenija", phone: null, country: "SI" }, { fetchImpl: fake(seen), resolve });
    expect(r?.match).toEqual({ url: "https://www.bizi.si/NEGA-D-O-O-CELJE/", legalName: "NEGA, d.o.o., Celje", by: "name" });
    expect(r?.emails).toEqual(["nega@siol.net"]);
    expect(seen).toEqual(["/iskanje", "/NEGA-D-O-O-CELJE/"]);
  });

  it("two companies at one address: picks by phone when names differ", async () => {
    const r = await lookupBizi({ name: "Lasni studio Bela", address: "Gledališki trg 8, 3000 Celje", phone: "03 555 66 77", country: "SI" }, { fetchImpl: fake([]), resolve });
    expect(r?.match?.by).toBe("phone");
    expect(r?.match?.legalName).toBe("NEGA, d.o.o., Celje");
  });

  it("no safe match → no e-mail; other countries are skipped", async () => {
    const r = await lookupBizi({ name: "Lasni studio Bela", address: "Gledališki trg 8, 3000 Celje", phone: null, country: "SI" }, { fetchImpl: fake([]), resolve });
    expect(r).toMatchObject({ match: null, emails: [], candidates: 2 });
    expect(await lookupBizi({ name: "x", address: "Gledališki trg 8, 3000 Celje", phone: null, country: "HR" }, { fetchImpl: fake([]), resolve })).toBeNull();
  });
});
