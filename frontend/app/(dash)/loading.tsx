export default function Loading() {
  return <div role="status" aria-live="polite" className="space-y-6">
    <p className="text-sm text-slate-500">Loading workspace…</p>
    <div aria-hidden="true" className="animate-pulse space-y-4 motion-reduce:animate-none">
      <div className="h-8 w-48 rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-slate-100" />)}</div>
      <div className="h-64 rounded-xl bg-slate-100" />
    </div>
  </div>;
}
