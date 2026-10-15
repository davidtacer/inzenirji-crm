"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, UserCircle2, X } from "lucide-react";
import { LogoutButton } from "@/app/logout-button";
import { SidebarNav } from "./Sidebar";

function Logo() {
  return (
    <Link href="/" className="font-mono text-sm font-extrabold tracking-tightest">
      INZENIRJI<span className="text-accent">.SI</span> <span className="text-text-secondary">{"// CRM"}</span>
    </Link>
  );
}

/** Full-width app frame: fixed sidebar on desktop, slide-in menu on phones, top bar with the signed-in owner. */
export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-base">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-border px-6">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Zapri meni" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Logo />
              <button type="button" aria-label="Zapri meni" onClick={() => setOpen(false)} className="text-text-secondary hover:text-accent">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-border bg-base/95 px-4 md:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button type="button" aria-label="Odpri meni" onClick={() => setOpen(true)} className="text-text-primary hover:text-accent">
              <Menu size={20} />
            </button>
            <Logo />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 font-mono text-[11px] text-text-secondary sm:flex">
              <UserCircle2 size={16} aria-hidden />
              {email}
            </span>
            <LogoutButton />
          </div>
        </header>
        <main className="px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
