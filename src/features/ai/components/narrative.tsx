"use client";

import { aiEndOfDayAction, aiInsightsAction, aiWeeklyAction } from "../actions";
import { AI_NOTE, AiButton, AiError, AiNotConfigured, useAiCall } from "./ai-ui";

const Box = ({ children }: { children: React.ReactNode }) => <div className="space-y-3 rounded-lg border border-line bg-surface p-4 text-[13px]">{children}</div>;
const List = ({ title, items }: { title: string; items: string[] }) => items.length ? (<div><h4 className="mb-1 text-xs font-medium">{title}</h4><ul className="list-disc space-y-0.5 pl-5">{items.map((t, i) => (<li key={i}>{t}</li>))}</ul></div>) : null;

/** Explains server-computed metrics for the selected range. Numbers shown on the page come from the server, not the model. */
export function InsightsAssistant({ configured, preset, from, to, subjectId }: { configured: boolean; preset: string; from: string; to: string; subjectId?: string | null }) {
  const call = useAiCall(aiInsightsAction);
  if (!configured) return <AiNotConfigured compact />;
  const d = call.data;
  return (
    <section aria-label="AI insights" className="space-y-2">
      <div className="flex items-center gap-2">
        <AiButton pending={call.pending} onClick={() => call.run({ preset, from, to, subjectId: subjectId ?? null })}>Explain these numbers</AiButton>
        <span className="text-[11px] text-ink-muted">{AI_NOTE}</span>
      </div>
      <AiError message={call.error} />
      {d ? (
        <Box>
          <p className="font-medium">{d.headline}</p>
          <ul className="space-y-2">
            {d.points.map((p, i) => (
              <li key={i}>
                <p className="font-medium">{p.title}</p>
                <p className="text-ink-muted">{p.detail}</p>
                <p className="text-[11px] text-ink-muted">{p.metricRefs.length ? `Based on: ${p.metricRefs.join(", ")}` : "No supporting metric. Treat with caution."}</p>
              </li>
            ))}
          </ul>
          {d.attention.length ? <List title="High-priority tasks needing attention" items={d.attention.map((a) => `${d.attentionTitles[a.id] ?? "Task"}: ${a.reason}`)} /> : null}
          <List title="Next steps" items={d.nextSteps} />
          <button onClick={call.clear} className="text-xs text-ink-muted hover:underline">Dismiss</button>
        </Box>
      ) : null}
    </section>
  );
}

export function EndOfDayAssistant({ configured, date, subjectId }: { configured: boolean; date: string; subjectId?: string | null }) {
  const call = useAiCall(aiEndOfDayAction);
  if (!configured) return <AiNotConfigured compact />;
  const d = call.data;
  return (
    <section aria-label="AI end-of-day summary" className="mb-6 space-y-2">
      <div className="flex items-center gap-2">
        <AiButton pending={call.pending} onClick={() => call.run({ date, subjectId: subjectId ?? null })}>Summarise my day</AiButton>
        <span className="text-[11px] text-ink-muted">{AI_NOTE}</span>
      </div>
      <AiError message={call.error} />
      {d ? (
        <Box>
          <p>{d.summary}</p>
          <List title="Wins" items={d.wins} />
          <List title="Unfinished priorities" items={d.unfinishedPriorities.map((u) => u.reason)} />
          <List title="Next actions" items={d.nextActions.map((n) => n.text)} />
          <button onClick={call.clear} className="text-xs text-ink-muted hover:underline">Dismiss</button>
        </Box>
      ) : null}
    </section>
  );
}

export function WeeklyAssistant({ configured, start, subjectId }: { configured: boolean; start: string; subjectId?: string | null }) {
  const call = useAiCall(aiWeeklyAction);
  if (!configured) return <AiNotConfigured compact />;
  const d = call.data;
  return (
    <section aria-label="AI weekly narrative" className="mb-8 space-y-2">
      <div className="flex items-center gap-2">
        <AiButton pending={call.pending} onClick={() => call.run({ start, subjectId: subjectId ?? null })}>Write weekly narrative</AiButton>
        <span className="text-[11px] text-ink-muted">{AI_NOTE}</span>
      </div>
      <AiError message={call.error} />
      {d ? (
        <Box>
          <p>{d.narrative}</p>
          <List title="Strengths" items={d.strengths} />
          <List title="Bottlenecks" items={d.bottlenecks} />
          <List title="Repeated postponements" items={d.repeatedPostponements.map((r) => r.note)} />
          <List title="Recommendations" items={d.recommendations} />
          <button onClick={call.clear} className="text-xs text-ink-muted hover:underline">Dismiss</button>
        </Box>
      ) : null}
    </section>
  );
}
