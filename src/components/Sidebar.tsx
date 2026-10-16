"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarClock,
  FileText,
  FolderKanban,
  Gauge,
  Inbox,
  Mail,
  Search,
  Settings,
  ShieldBan,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; soon?: boolean };
type Group = { title?: string; items: Item[] };

const GROUPS: Group[] = [
  { items: [{ href: "/", label: "Danes", icon: Gauge }] },
  {
    title: "Prodaja",
    items: [
      { href: "/iskanje", label: "Iskanje strank", icon: Search },
      { href: "/podjetja", label: "Podjetja", icon: Building2 },
      { href: "/osnutki", label: "Osnutki", icon: Mail },
      { href: "/odgovori", label: "Odgovori", icon: Inbox },
      { href: "/klici", label: "Klici", icon: CalendarClock },
      { href: "/ponudbe", label: "Ponudbe", icon: FileText },
    ],
  },
  { title: "Izvedba", items: [{ href: "/projekti", label: "Projekti", icon: FolderKanban, soon: true }] },
  {
    title: "Analitika",
    items: [{ href: "/porocila", label: "Poročila", icon: BarChart3, soon: true }],
  },
  {
    title: "Nastavitve",
    items: [
      { href: "/nastavitve", label: "Nastavitve", icon: Settings },
      { href: "/ne-kontaktiraj", label: "Ne kontaktiraj", icon: ShieldBan, soon: true },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Glavni meni" className="flex flex-col gap-6 px-3 py-4">
      {GROUPS.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {g.title ? (
            <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary/70">{g.title}</p>
          ) : null}
          {g.items.map((it) => {
            const Icon = it.icon;
            if (it.soon) {
              return (
                <span
                  key={it.href}
                  aria-disabled
                  className="flex items-center gap-3 border border-transparent px-3 py-2 font-sans text-sm text-text-secondary/40"
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{it.label}</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest">kmalu</span>
                </span>
              );
            }
            const active = isActive(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 border px-3 py-2 font-sans text-sm ${
                  active
                    ? "border-accent/60 bg-surface2 text-accent"
                    : "border-transparent text-text-primary hover:border-border hover:bg-surface2"
                }`}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
