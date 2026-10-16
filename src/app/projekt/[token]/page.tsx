import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { projectByToken, type Material } from "@/server/projects/projects";
import { ItemForm, RemoveFile } from "./forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Materiali za vašo stran · inženirji.si", robots: { index: false, follow: false } };

const day = (d: Date) => d.toLocaleDateString("sl-SI", { timeZone: "Europe/Ljubljana", weekday: "long", day: "numeric", month: "numeric", year: "numeric" });
/** Items that are usually typed in (not only uploaded). */
const TEXTY = /besedil|cenik|storit|kontakt|delovni|jezik|dostop|domen|opis|o nas/i;

/** Client page for materials and progress (TASK-014, ADR-033). No login: the token in the link is the access. */
export default async function ClientProject({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await projectByToken(getDb(), token);
  if (!r) notFound();
  const p = r.p;
  const mats = p.materials as Material[];
  const done = mats.filter((m) => m.done).length;
  const open = p.status === "materials";
  return (
    <main className="min-h-screen bg-black px-4 py-10 text-[#EAEAEA]">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="border-b border-[#222] pb-6">
          <p className="font-mono text-sm font-bold text-[#00FF41]">inženirji.si</p>
          <h1 className="mt-3 font-mono text-2xl font-extrabold">Vaša nova spletna stran — {r.companyName}</h1>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-[#EAEAEA]">
            {p.launchedAt
              ? "Stran je objavljena. Hvala za zaupanje!"
              : r.clock.started
                ? r.clock.paused
                  ? "Izdelava čaka na vaš odgovor — rok miruje, dokler ne odgovorite na naš e-mail."
                  : `Prejeli smo vse potrebno. Stran bo na spletu najkasneje do ${day(r.clock.deadline!)}.`
                : `Oddajte spodnje materiale. Ko prejmemo vse, vam pisno potrdimo in stran je na spletu v ${p.timelineDays} dneh.`}
          </p>
          {open ? (
            <p className="mt-3 font-mono text-xs text-[#888]">
              Oddano {done} od {mats.length} · slike, PDF, Word, Excel, ZIP do 20 MB na datoteko
            </p>
          ) : null}
        </header>

        <ol className="flex flex-col gap-4">
          {mats.map((m, i) => (
            <li key={i} className={`border bg-[#0A0A0A] p-5 ${m.done ? "border-[#00FF41]/50" : "border-[#222]"}`}>
              <p className="flex items-center gap-3 font-sans text-[15px]">
                <span className={`shrink-0 whitespace-nowrap font-mono text-xs ${m.done ? "text-[#00FF41]" : "text-[#888]"}`}>{m.done ? "✓ ODDANO" : `${i + 1}.`}</span>
                {m.label}
              </p>
              {m.text && !open ? <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-[#888]">{m.text}</pre> : null}
              <ul className="mt-2 flex flex-col gap-1">
                {r.files
                  .filter((f) => f.itemIndex === i)
                  .map((f) => (
                    <li key={f.id} className="flex items-center gap-2 font-mono text-xs text-[#888]">
                      {f.name} {open ? <RemoveFile token={p.token} fileId={f.id} /> : null}
                    </li>
                  ))}
              </ul>
              {open ? <ItemForm token={p.token} index={i} text={m.text} wantsText={TEXTY.test(m.label)} /> : null}
            </li>
          ))}
        </ol>

        <footer className="font-mono text-[10px] text-[#888]">Vprašanja: david@inzenirji.si · inženirji.si</footer>
      </div>
    </main>
  );
}
