import Link from "next/link";
import { LogoutButton } from "@/app/logout-button";

const NAV = [
  { href: "/", label: "Danes" },
  { href: "/iskanje", label: "Iskanje" },
];

export function AppHeader({ email, active }: { email: string; active: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="font-mono text-sm font-extrabold tracking-tightest">
          INZENIRJI<span className="text-accent">.SI</span> <span className="text-text-secondary">{"// CRM"}</span>
        </Link>
        <nav className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-widest">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={n.href === active ? "text-accent" : "text-text-secondary hover:text-accent"}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[10px] text-text-secondary md:inline">{email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
