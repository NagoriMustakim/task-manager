"use client";

import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useEffect, useState } from "react";
import { DateField, SelectField } from "@/components/ui/fields";
import { presetRule, serializeRule, type Freq, type Preset } from "@/lib/recurrence";

type Choice = "none" | Preset | "custom";
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Builds an RRULE (or null) from friendly controls. `startDate` anchors weekly/monthly presets. */
export function RepeatPicker({
  startDate,
  onChange,
}: {
  startDate: string;
  onChange: (rrule: string | null, until: string | null) => void;
}) {
  const [choice, setChoice] = useState<Choice>("none");
  const [interval, setIntervalN] = useState(1);
  const [freq, setFreq] = useState<Freq>("DAILY");
  const [days, setDays] = useState<number[]>([]);
  const [until, setUntil] = useState("");

  useEffect(() => {
    if (choice === "none") return onChange(null, null);
    const rule =
      choice === "custom"
        ? { freq, interval: Math.max(1, Math.min(365, interval || 1)), byday: freq === "WEEKLY" ? days : [], bymonthday: freq === "MONTHLY" ? Number(startDate.slice(8, 10)) : null }
        : presetRule(choice, startDate);
    onChange(serializeRule(rule), until || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, interval, freq, days, until, startDate]);

  return (
    <>
      <SelectField
        label="Repeat"
        value={choice}
        onChange={(v) => setChoice(v as Choice)}
        sx={{ minWidth: 170 }}
        options={[
          { value: "none", label: "Does not repeat" },
          { value: "daily", label: "Every day" },
          { value: "weekdays", label: "Every weekday" },
          { value: "weekly", label: "Every week" },
          { value: "monthly", label: "Every month" },
          { value: "custom", label: "Custom…" },
        ]}
      />
      {choice === "custom" ? (
        <>
          <TextField label="Every" type="number" value={interval} onChange={(e) => setIntervalN(Number(e.target.value))} slotProps={{ htmlInput: { min: 1, max: 365 } }} sx={{ width: 90 }} />
          <SelectField label="Unit" value={freq} onChange={(v) => setFreq(v as Freq)} sx={{ minWidth: 120 }} options={[{ value: "DAILY", label: "day(s)" }, { value: "WEEKLY", label: "week(s)" }, { value: "MONTHLY", label: "month(s)" }]} />
          {freq === "WEEKLY" ? (
            <fieldset>
              <legend className="sr-only">Days of the week</legend>
              <ToggleButtonGroup size="small" value={days} onChange={(_, v: number[]) => setDays(v)} aria-label="Days of the week">
                {DAYS.map((d, i) => (<ToggleButton key={i} value={i} aria-label={DAY_LABELS[i]} sx={{ width: 36, height: 40 }}>{d}</ToggleButton>))}
              </ToggleButtonGroup>
            </fieldset>
          ) : null}
        </>
      ) : null}
      {choice !== "none" ? <DateField label="Ends (optional)" min={startDate} value={until} onChange={setUntil} sx={{ width: 170 }} /> : null}
    </>
  );
}
