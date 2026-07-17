export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-10 text-center">
      <div className="w-12 h-12 rounded-full bg-coral-soft text-coral grid place-items-center text-xl mx-auto mb-4">✦</div>
      <div className="font-display font-semibold text-xl mb-1">{title}</div>
      <p className="text-muted text-sm max-w-sm mx-auto">{body}</p>
    </div>
  );
}
