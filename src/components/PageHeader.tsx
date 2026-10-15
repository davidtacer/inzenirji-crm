export function PageHeader({ title, description, right }: { title: string; description?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-mono text-2xl font-extrabold tracking-tightest text-text-primary">{title}</h1>
        {description ? <p className="mt-1 font-sans text-sm text-text-secondary">{description}</p> : null}
      </div>
      {right}
    </div>
  );
}
