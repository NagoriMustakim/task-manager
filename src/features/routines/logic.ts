/** Pure helpers for the routines (repeating tasks) view. */
export type ChipState = "done" | "incomplete" | "missed" | "moved" | "upcoming" | "today";
export interface OccLite { id: string; scheduledDate: string; status: "new" | "pending" | "done" | "incomplete"; moved: boolean }

/** done / incomplete / moved are final; an open occurrence is "missed" once its day has passed. */
export function chipState(o: OccLite, today: string): ChipState {
  if (o.moved) return "moved";
  if (o.status === "done") return "done";
  if (o.status === "incomplete") return "incomplete";
  if (o.scheduledDate < today) return "missed";
  return o.scheduledDate === today ? "today" : "upcoming";
}

export function summarise(occ: OccLite[], today: string) {
  const sorted = [...occ].sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : 1));
  const states = sorted.map((o) => ({ ...o, state: chipState(o, today) }));
  const count = (s: ChipState) => states.filter((x) => x.state === s).length;
  const next = states.find((x) => x.state === "today" || x.state === "upcoming");
  return { states, done: count("done"), incomplete: count("incomplete"), missed: count("missed"), moved: count("moved"), nextDate: next?.scheduledDate ?? null };
}
