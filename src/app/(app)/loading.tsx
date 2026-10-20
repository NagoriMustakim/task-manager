export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mb-5 h-7 w-40 animate-pulse rounded bg-line" />
      <div className="mb-4 h-28 animate-pulse rounded-xl bg-line/70" />
      {[0, 1, 2].map((i) => (<div key={i} className="mb-1 h-12 animate-pulse rounded-lg bg-line/50" />))}
    </div>
  );
}
