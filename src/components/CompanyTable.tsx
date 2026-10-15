import { isGoodBusiness } from "@/server/places/import";
import { websiteKind } from "@/server/contact/website";

type Row = {
  id: string;
  name: string;
  city: string | null;
  category: string | null;
  ratingX10: number | null;
  reviewCount: number | null;
  website: string | null;
  websiteDomain: string | null;
  phone: string | null;
  stage: string | null;
};

const STAGE: Record<string, string> = {
  found: "najdeno",
  researched: "raziskano",
  contacted: "kontaktirano",
  replied: "odgovoril",
  call_booked: "klic",
  call_done: "po klicu",
  proposal_sent: "ponudba",
  won: "stranka",
  lost: "izgubljeno",
  nurture: "kasneje",
};

export function CompanyTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="border border-border bg-surface p-6 font-mono text-xs text-text-secondary">&gt; Še ni podjetij. Začni z iskanjem.</p>;
  }
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-surface font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            <th className="p-3 font-normal">Podjetje</th>
            <th className="p-3 font-normal">Kraj</th>
            <th className="p-3 font-normal">Ocena</th>
            <th className="p-3 font-normal">Spletna stran</th>
            <th className="p-3 font-normal">Telefon</th>
            <th className="p-3 font-normal">Faza</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-surface">
              <td className="p-3">
                <p className="font-sans text-sm text-text-primary">{r.name}</p>
                <p className="font-mono text-[10px] text-text-secondary">{r.category ?? ""}</p>
              </td>
              <td className="p-3 font-sans text-sm text-text-secondary">{r.city ?? "—"}</td>
              <td className="p-3 font-mono text-xs">
                {r.ratingX10 !== null ? (r.ratingX10 / 10).toFixed(1).replace(".", ",") : "—"}
                <span className="text-text-secondary"> ({r.reviewCount ?? 0})</span>
                {isGoodBusiness(r) ? <span className="ml-2 whitespace-nowrap border border-accent/50 px-1 text-[9px] text-accent">DOBER POSEL</span> : null}
              </td>
              <td className="p-3 font-mono text-xs">
                <WebsiteCell website={r.website} domain={r.websiteDomain} />
              </td>
              <td className="p-3 font-mono text-xs text-text-secondary">{r.phone ?? "—"}</td>
              <td className="p-3 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{r.stage ? STAGE[r.stage] : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WebsiteCell({ website, domain }: { website: string | null; domain: string | null }) {
  const kind = websiteKind(domain);
  if (!website || kind === "none") return <span className="text-danger-text">NIMA STRANI</span>;
  const link = (
    <a href={website} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-accent">
      {domain ?? website} ↗
    </a>
  );
  if (kind === "own") return link;
  // Social profile or link page: not an own site (group B), but the link stays — it is useful in outreach.
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[10px] tracking-widest text-danger-text">{kind === "social" ? "SAMO DRUŽBENO OMREŽJE" : "SAMO LINK"}</span>
      {link}
    </span>
  );
}
