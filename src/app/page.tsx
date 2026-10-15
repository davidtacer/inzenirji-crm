export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="mb-6 font-mono text-xs uppercase tracking-[0.3em] text-accent">{"// INZENIRJI.SI // CRM"}</p>
      <h1 className="font-mono text-4xl font-extrabold tracking-tightest text-text-primary md:text-5xl">
        Danes<span className="terminal-cursor" aria-hidden />
      </h1>
      <p className="mt-6 max-w-xl font-sans text-base text-text-secondary">
        Tukaj bo seznam današnjih najboljših leadov, osnutki za potrditev in projekti z rokom garancije.
      </p>
      <div className="mt-12 border border-border bg-surface p-6 font-mono text-xs text-text-secondary">
        <p>
          &gt; STATUS: <span className="text-accent">OGRODJE PRIPRAVLJENO</span>
        </p>
        <p>&gt; NASLEDNJE: PRIJAVA, BAZA, ISKANJE STRANK</p>
      </div>
    </main>
  );
}
