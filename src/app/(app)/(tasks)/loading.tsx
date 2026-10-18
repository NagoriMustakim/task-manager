export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading tasks…</span>
      <div className="mb-5 h-7 w-40 animate-pulse rounded bg-line" />
      <div className="mb-4 h-16 animate-pulse rounded-lg bg-line/70" />
      <div className="mb-4 h-11 animate-pulse rounded-lg bg-line/70" />
      {[0, 1, 2, 3].map((i) => (<div key={i} className="mb-1 h-12 animate-pulse rounded-lg bg-line/50" />))}
    </div>
  );
}
