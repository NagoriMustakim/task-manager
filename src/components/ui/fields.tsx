"use client";

import MenuItem from "@mui/material/MenuItem";
import TextField, { type TextFieldProps } from "@mui/material/TextField";

type Common = Pick<TextFieldProps, "label" | "name" | "required" | "disabled" | "autoFocus" | "fullWidth" | "size" | "sx" | "helperText" | "error" | "placeholder"> & {
  "aria-label"?: string;
};

interface ControlledOrDefault<V> {
  value?: V;
  defaultValue?: V;
  onChange?: (value: V) => void;
}

/** Native date input, themed by MUI so it matches every other control and the light/dark theme. */
export function DateField({ min, max, value, defaultValue, onChange, "aria-label": ariaLabel, ...rest }: Common & ControlledOrDefault<string> & { min?: string; max?: string }) {
  return (
    <TextField
      {...rest}
      type="date"
      value={value}
      defaultValue={defaultValue}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      slotProps={{ inputLabel: { shrink: true }, input: { notched: true }, htmlInput: { min, max, "aria-label": ariaLabel } }}
    />
  );
}

export function DateTimeField({ value, defaultValue, onChange, "aria-label": ariaLabel, ...rest }: Common & ControlledOrDefault<string>) {
  return (
    <TextField
      {...rest}
      type="datetime-local"
      value={value}
      defaultValue={defaultValue}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      slotProps={{ inputLabel: { shrink: true }, input: { notched: true }, htmlInput: { "aria-label": ariaLabel } }}
    />
  );
}

export function TimeField({ value, defaultValue, onChange, "aria-label": ariaLabel, ...rest }: Common & ControlledOrDefault<string>) {
  return (
    <TextField
      {...rest}
      type="time"
      value={value}
      defaultValue={defaultValue}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      slotProps={{ inputLabel: { shrink: true }, input: { notched: true }, htmlInput: { "aria-label": ariaLabel } }}
    />
  );
}

export interface Option<T extends string | number> { value: T; label: string }

/** MUI select menu (instead of the browser's native dropdown). */
export function SelectField<T extends string | number>({
  options, value, defaultValue, onChange, "aria-label": ariaLabel, ...rest
}: Common & ControlledOrDefault<T> & { options: Option<T>[] }) {
  return (
    <TextField
      {...rest}
      select
      value={value}
      defaultValue={defaultValue}
      onChange={onChange ? (e) => onChange((typeof options[0]?.value === "number" ? Number(e.target.value) : e.target.value) as T) : undefined}
      slotProps={{ inputLabel: { shrink: true }, input: { notched: true }, select: { displayEmpty: true, MenuProps: { slotProps: { paper: { sx: { maxHeight: 320 } } } } }, htmlInput: { "aria-label": ariaLabel } }}
    >
      {options.map((o) => (<MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>))}
    </TextField>
  );
}
