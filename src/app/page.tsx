import { requireOwner } from "@/server/auth/session";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireOwner();
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">{"// INZENIRJI.SI // CRM"}</p>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[10px] text-text-secondary sm:inline">{user.email}</span>
          <LogoutButton />
        </div>
      </div>
      <h1 className="font-mono text-4xl font-extrabold tracking-tightest text-text-primary md:text-5xl">
        Danes<span className="terminal-cursor" aria-hidden />
      </h1>
      <p className="mt-6 max-w-xl font-sans text-base text-text-secondary">
        Tukaj bo seznam današnjih najboljših leadov, osnutki za potrditev in projekti z rokom garancije.
      </p>
      <div className="mt-12 border border-border bg-surface p-6 font-mono text-xs text-text-secondary">
        <p>
          &gt; STATUS: <span className="text-accent">PRIJAVA DELUJE</span>
        </p>
        <p>&gt; NASLEDNJE: ISKANJE STRANK (GOOGLE PLACES), RAZISKAVA, OCENA LEADOV</p>
      </div>
    </main>
  );
}
