import type { Metadata } from "next";
import { getAiStatus } from "@/features/ai/client";
import { WorkHoursForm } from "@/features/ai/components/work-hours-form";
import { usageSummary } from "@/features/ai/service";
import { getReminderPrefs } from "@/features/reminders/queries";
import { ReminderPrefsForm } from "@/features/reminders/prefs-form";
import { PageHeader } from "@/features/tasks/components/page-header";
import { TimezoneForm } from "@/features/tasks/components/timezone-form";
import { getUserSettings } from "@/features/tasks/queries";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { timezone, today, workStart, workEnd } = await getUserSettings();
  const zones = Intl.supportedValuesOf("timeZone");
  const status = getAiStatus();
  const reminderPrefs = await getReminderPrefs();
  const usage = status.configured ? await usageSummary().catch(() => null) : null;
  return (
    <>
      <PageHeader title="Settings" subtitle={`Today is ${today} in ${timezone}`} />
      <div className="space-y-10">
        <section aria-labelledby="tz"><h2 id="tz" className="mb-3 text-sm font-semibold">Timezone</h2><TimezoneForm current={timezone} zones={zones} /></section>
        <section aria-labelledby="wh"><h2 id="wh" className="mb-3 text-sm font-semibold">Working hours</h2><WorkHoursForm start={workStart} end={workEnd} /></section>
        <section aria-labelledby="rm"><h2 id="rm" className="mb-3 text-sm font-semibold">Reminders</h2><ReminderPrefsForm initial={reminderPrefs} /></section>
        <section aria-labelledby="ai">
          <h2 id="ai" className="mb-3 text-sm font-semibold">AI assistant</h2>
          {status.configured ? (
            <div className="max-w-sm space-y-1 text-[13px]">
              <p>Configured on the server.</p>
              {usage ? <p className="text-ink-muted">This month: {usage.calls} requests ({usage.failed} failed), {usage.inputTokens.toLocaleString()} input / {usage.outputTokens.toLocaleString()} output tokens{usage.estimatedCostUsd !== null ? `, about $${usage.estimatedCostUsd}` : ""}.</p> : null}
              <p className="text-xs text-ink-muted">Only the data needed for each request is sent. Nothing changes without your approval.</p>
            </div>
          ) : (
            <p className="max-w-md text-[13px] text-ink-muted">Not configured. Missing on the server: {status.missing.join(", ")}. See docs/ai-assistant.md. The rest of the app works without it.</p>
          )}
        </section>
      </div>
    </>
  );
}
