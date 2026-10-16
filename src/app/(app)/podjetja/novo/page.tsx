import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { NewCompanyForm } from "./form";

export default function NewCompanyPage() {
  return (
    <>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
        <Link href="/podjetja" className="hover:text-accent">
          ← Podjetja
        </Link>
      </p>
      <PageHeader title="Dodaj podjetje" description="Ročni vnos: podjetje, ki ga ni na Googlu, priporočilo, ali tvoj testni naslov." />
      <NewCompanyForm />
    </>
  );
}
