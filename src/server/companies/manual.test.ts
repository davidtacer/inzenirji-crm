import { describe, expect, it } from "vitest";
import { findAddress, prefillFromHtml, prefillFromUrl } from "./manual";

const BIZI = `<html><head><title>FIZIS d.o.o. - Bizi.si</title></head><body>
<a href="https://www.bizi.si/prijava/">Prijavi se</a><a href="https://www.facebook.com/bizi.si">fb</a>
<h1>FIZIS d.o.o.</h1>
<div>Cesta proletarskih brigad 79, Maribor, 2000 Maribor</div>
<div>Glavna dejavnost<br>86.906 Dejavnost fizioterapije</div>
<a href="tel:02 333 44 55">02 333 44 55</a>
<a href="mailto:info@fizis.si">info@fizis.si</a> <a href="mailto:info@bizi.si">pomoč</a>
<a href="https://www.fizis.si/">www.fizis.si</a>
<a href="https://itis.siol.net/extsearch.aspx?x">Več kontaktov v TIS-u</a></body></html>`;

describe("prefillFromHtml", () => {
  it("reads a bizi.si company page", () => {
    expect(prefillFromHtml(BIZI, "https://www.bizi.si/FIZIS-D-O-O/")).toEqual({
      name: "FIZIS d.o.o.",
      address: "Cesta proletarskih brigad 79, 2000 Maribor",
      city: "Maribor",
      phone: "02 333 44 55",
      email: "info@fizis.si",
      emailSource: "https://www.bizi.si/FIZIS-D-O-O/",
      website: "https://www.fizis.si",
      category: "Dejavnost fizioterapije",
    });
  });
  it("reads a company's own site; s.p. without e-mail gives empty fields to fill in", () => {
    const own = prefillFromHtml(`<title>Salon Ana | Frizer Celje</title><p>Gosposka ulica 2, 3000 Celje</p><p>Pokličite 041 372 307 ali pišite info [at] salon-ana [dot] si</p>`, "https://www.salon-ana.si/");
    expect(own).toMatchObject({ name: "Salon Ana", address: "Gosposka ulica 2, 3000 Celje", city: "Celje", phone: "041 372 307", email: "info@salon-ana.si", website: "https://www.salon-ana.si" });
    const sp = prefillFromHtml(`<h1>ALEKSANDRA STEGU s.p.</h1><p>Gosposka ulica 2, Celje, 3000 Celje 041 372307</p>`, "https://www.bizi.si/ALEKSANDRA-STEGU-S-P/");
    expect(sp).toMatchObject({ name: "ALEKSANDRA STEGU s.p.", city: "Celje", phone: "041 372307", email: "", website: "" });
  });
});

describe("findAddress", () => {
  it("handles house letters and missing middle town", () => {
    expect(findAddress("Zadobrova 40A, 3211 Škofja vas")).toEqual({ address: "Zadobrova 40A, 3211 Škofja vas", city: "Škofja vas" });
    expect(findAddress("brez naslova")).toBeNull();
  });
});

describe("prefillFromUrl", () => {
  it("adds https and refuses error pages", async () => {
    const resolve = async () => ["93.184.216.34"];
    const ok = (async () => new Response(BIZI, { status: 200 })) as unknown as typeof fetch;
    expect((await prefillFromUrl("www.bizi.si/FIZIS-D-O-O/", { fetchImpl: ok, resolve })).name).toBe("FIZIS d.o.o.");
    const nf = (async () => new Response("x", { status: 404 })) as unknown as typeof fetch;
    await expect(prefillFromUrl("https://x.si", { fetchImpl: nf, resolve })).rejects.toThrow("HTTP_404");
  });
});
