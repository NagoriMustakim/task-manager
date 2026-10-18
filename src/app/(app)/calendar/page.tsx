import type { Metadata } from "next";
import { ComingSoon } from "@/features/tasks/components/coming-soon";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return <ComingSoon title="Calendar" description="A month and week calendar of your scheduled tasks arrives in a later phase." />;
}
