import { NEW_TASK_EVENT } from "@/features/tasks/components/composer";

/** Focuses the quick-add composer if the current page has one; otherwise opens Today with it focused. */
export function requestNewTask(navigate: (href: string) => void) {
  const detail = { handled: false };
  window.dispatchEvent(new CustomEvent(NEW_TASK_EVENT, { detail }));
  if (!detail.handled) navigate("/today?new=1");
}
