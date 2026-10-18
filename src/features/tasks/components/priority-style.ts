import type { TaskPriority, TaskStatus } from "../types";

/** Shared, high-contrast priority and status styling (tokens live in globals.css and switch with the theme). */
export const PRIORITY_CHIP: Record<TaskPriority, string> = {
  none: "border-line-strong bg-line/40 text-ink-muted",
  low: "border-pri-low/40 bg-pri-low/15 text-pri-low",
  medium: "border-pri-medium/40 bg-pri-medium/15 text-pri-medium",
  high: "border-pri-high/50 bg-pri-high/15 text-pri-high",
  urgent: "border-pri-urgent/50 bg-pri-urgent/15 text-pri-urgent",
};
export const PRIORITY_BAR: Record<TaskPriority, string> = {
  none: "bg-line-strong",
  low: "bg-pri-low",
  medium: "bg-pri-medium",
  high: "bg-pri-high",
  urgent: "bg-pri-urgent",
};
export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: "text-ink-muted",
  pending: "text-pri-high",
  done: "text-success",
  incomplete: "text-danger",
};
export const STATUS_CHIP: Record<TaskStatus, string> = {
  new: "border-line-strong bg-line/40 text-ink-muted",
  pending: "border-pri-high/50 bg-pri-high/15 text-pri-high",
  done: "border-success/40 bg-success/15 text-success",
  incomplete: "border-danger/40 bg-danger/15 text-danger",
};
