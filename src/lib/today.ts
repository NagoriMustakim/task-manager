import "server-only";
import { todayIn } from "@/lib/dates";

/** One app-wide timezone (default India). Override with the APP_TIMEZONE environment variable. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";
export const getToday = () => todayIn(APP_TIMEZONE);
