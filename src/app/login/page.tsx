import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm border border-border bg-surface p-8">
        <p className="mb-6 font-mono text-lg font-extrabold tracking-tightest">
          INZENIRJI<span className="text-accent">.SI</span> <span className="text-text-secondary">{"// CRM"}</span>
        </p>
        <p className="mb-6 font-sans text-sm text-text-secondary">Vpiši svoj e-naslov in pošljemo ti povezavo za prijavo.</p>
        {error ? (
          <p role="alert" className="mb-4 border border-danger-border bg-danger-bg px-3 py-2 font-mono text-xs text-danger-text">
            &gt; Povezava ne velja več. Zahtevaj novo.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
