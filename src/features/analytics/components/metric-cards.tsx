import type { Report } from "../compute";
import { formatSeconds } from "@/lib/time";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null, d = 1) => (v === null ? "—" : String(Math.round(v * 10 ** d) / 10 ** d));

interface Card { label: string; value: string; note: string }

/** Every card states its denominator; definitions live in docs/analytics.md. */
export function MetricCards({ report }: { report: Report }) {
  const s = report.summary;
  const groups: { title: string; cards: Card[] }[] = [
    {
      title: "Volume",
      cards: [
        { label: "Unique tasks created", value: String(s.uniqueTasksCreated), note: "Tasks created in the period" },
        { label: "Scheduled occurrences", value: String(s.scheduledOccurrences), note: `${s.uniqueTasksScheduled} unique tasks; ${s.movedCount} moved away` },
        { label: "Completed in period", value: String(s.completedDuringOccurrences), note: `${s.completedDuringUniqueTasks} unique tasks, any scheduled date` },
        { label: "Scheduled and done", value: String(s.scheduledDone), note: "Scheduled in the period, done at any time" },
      ],
    },
    {
      title: "Status of scheduled work",
      cards: [
        { label: "New", value: String(s.newCount), note: "Not started" },
        { label: "Pending", value: String(s.pendingCount), note: "In progress" },
        { label: "Incomplete", value: String(s.incompleteCount), note: "Marked incomplete" },
        { label: "Overdue", value: String(s.overdue), note: "Open and scheduled before today" },
      ],
    },
    {
      title: "Rates",
      cards: [
        { label: "Completion rate", value: pct(s.completionRate), note: `${s.scheduledDone} done of ${s.dueOccurrences} due (not moved, scheduled up to today)` },
        { label: "On-time rate", value: pct(s.onTimeRate), note: `${s.onTimeDone} on time of ${s.dueOccurrences} due; ${s.lateCompleted} done late` },
        { label: "Average daily completion", value: num(s.avgDailyCompletion), note: `${s.completedDuringOccurrences} completed over ${s.daysElapsed} elapsed days` },
      ],
    },
    {
      title: "Carry-forward and time",
      cards: [
        { label: "Carried forward", value: String(s.carriedForward), note: `${s.uniqueTasksCarried} unique tasks (net of undone)` },
        { label: "Postponements per task", value: num(s.postponementsPerTask), note: "Among tasks carried forward" },
        { label: "Estimated time", value: formatSeconds(s.estimatedSeconds), note: "Estimates of scheduled occurrences" },
        { label: "Recorded time", value: formatSeconds(s.actualSeconds), note: "Finished timer/manual entries only" },
      ],
    },
  ];
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="mb-2 text-xs font-medium text-ink-muted">{g.title}</h2>
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {g.cards.map((c) => (
              <div key={c.label} className="rounded-lg border border-line bg-surface px-3 py-2.5">
                <dt className="text-xs text-ink-muted">{c.label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{c.value}</dd>
                <dd className="mt-0.5 text-[11px] leading-snug text-ink-muted">{c.note}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
