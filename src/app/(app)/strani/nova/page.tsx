import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/server/db/client";
import { companies, projects, deals } from "@/server/db/schema";
import { NewSiteForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewSitePage({ searchParams }: { searchParams: Promise<{ podjetje?: string; projekt?: string }> }) {
  const q = await searchParams;
  const db = getDb();
  const names = await db.select({ name: companies.name }).from(companies).orderBy(desc(companies.updatedAt)).limit(500);
  const pre = q.podjetje && /^[0-9a-f-]{36}$/.test(q.podjetje) ? (await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, q.podjetje)).limit(1))[0] : undefined;
  let paid = false;
  let projectId: string | undefined;
  if (q.projekt && /^[0-9a-f-]{36}$/.test(q.projekt)) {
    const [p] = await db.select({ id: projects.id, paid: projects.depositPaidAt }).from(projects).innerJoin(deals, eq(deals.id, projects.dealId)).where(eq(projects.id, q.projekt)).limit(1);
    if (p) {
      projectId = p.id;
      paid = !!p.paid;
    }
  }
  return (
    <>
      <PageHeader title="Nova stran" description="Podjetje iz baze ali novo. Ustvari repozitorij iz predloge, brief in poziv za agenta." />
      <NewSiteForm names={names.map((n) => n.name)} company={pre ?? null} projectId={projectId} depositPaid={paid} />
    </>
  );
}
