import { AppHeader } from "@/components/AppHeader";
import { CompanyTable } from "@/components/CompanyTable";
import { requireOwner } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { latestCompanies } from "@/server/places/list";
import { callsToday } from "@/server/places/quota";
import { PLACES_PROVIDER } from "@/server/places/search";
import { SearchForm } from "./search-form";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const user = await requireOwner();
  const db = getDb();
  const [rows, used] = await Promise.all([latestCompanies(db), callsToday(db, PLACES_PROVIDER)]);
  const cap = Number(process.env.PLACES_DAILY_CALL_CAP ?? 50);
  return (
    <>
      <AppHeader email={user.email} active="/iskanje" />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-mono text-3xl font-extrabold tracking-tightest">Iskanje strank</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            Google Places danes: <span className="text-accent">{used}</span> / {cap} klicev
          </p>
        </div>
        <SearchForm />
        <h2 className="mb-4 mt-10 font-mono text-xs uppercase tracking-[0.3em] text-accent">{"// Zadnja podjetja"}</h2>
        <CompanyTable rows={rows} />
      </main>
    </>
  );
}
