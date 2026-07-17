export function PageHeader({ title, sub, action }: {
  title: string; sub?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6 mb-8 flex-wrap">
      <div>
        <h1 className="font-display font-semibold text-4xl tracking-tight">{title}</h1>
        {sub && <p className="text-muted text-sm mt-2 max-w-xl">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
