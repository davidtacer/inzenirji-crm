import { CompanyTable } from "@/components/CompanyTable";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/server/db/client";
import { latestCompanies } from "@/server/places/list";
import { callsToday } from "@/server/places/quota";
import { PLACES_PROVIDER } from "@/server/places/search";
import { SearchForm } from "./search-form";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const db = getDb();
  const [rows, used] = await Promise.all([latestCompanies(db), callsToday(db, PLACES_PROVIDER)]);
  const cap = Number(process.env.PLACES_DAILY_CALL_CAP ?? 100);
  return (
    <>
      <PageHeader
        title="Iskanje strank"
        description="Google Places po panogi in kraju. Podvojena podjetja se samo posodobijo."
        right={
          <p className="border border-border bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            Google Places danes: <span className="text-accent">{used}</span> / {cap} klicev
          </p>
        }
      />
      <SearchForm />
      <h2 className="mb-3 mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Zadnja podjetja"}</h2>
      <CompanyTable rows={rows} />
    </>
  );
}
