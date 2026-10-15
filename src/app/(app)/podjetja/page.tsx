import Link from "next/link";
import { CompanyTable } from "@/components/CompanyTable";
import { GroupLegend } from "@/components/GroupLegend";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/server/db/client";
import { listCompanies, unresearchedCount, type CompanyFilter } from "@/server/research/run";
import { ResearchBatchButton } from "./buttons";

export const dynamic = "force-dynamic";

const FILTERS: [CompanyFilter, string][] = [
  ["all", "Vsa"],
  ["good", "Dober posel"],
  ["found", "Neraziskana"],
  ["researched", "Raziskana"],
  ["A", "A · prenos"],
  ["B", "B · nova stran"],
];

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const filter = (FILTERS.find(([k]) => k === f)?.[0] ?? "all") as CompanyFilter;
  const db = getDb();
  const [rows, pending] = await Promise.all([listCompanies(db, filter), unresearchedCount(db)]);
  return (
    <>
      <PageHeader title="Podjetja" description="Vsa najdena podjetja. Raziskava odpre njihovo stran in predlaga skupino A ali B." right={<ResearchBatchButton pending={pending} />} />
      <GroupLegend />
      <div className="mb-4 flex flex-wrap gap-px border border-border bg-border">
        {FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={k === "all" ? "/podjetja" : `/podjetja?f=${k}`}
            className={`px-4 py-2 font-mono text-[10px] uppercase tracking-widest ${k === filter ? "bg-accent text-black" : "bg-surface text-text-secondary hover:text-accent"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <CompanyTable rows={rows} />
    </>
  );
}
