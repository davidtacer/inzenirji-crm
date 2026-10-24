import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/server/db/client";
import { companies } from "@/server/db/schema";
import { RegisterForm } from "./form";

export const dynamic = "force-dynamic";

export default async function RegisterSitePage() {
  const names = await getDb().select({ name: companies.name }).from(companies).orderBy(desc(companies.updatedAt)).limit(500);
  return (
    <>
      <PageHeader title="Registriraj obstoječo stran" description="Samo zapis v CRM-ju. Repozitorija ne ustvarjamo in vanj ne pišemo." />
      <RegisterForm names={names.map((n) => n.name)} />
    </>
  );
}
