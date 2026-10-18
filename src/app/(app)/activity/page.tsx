import type { Metadata } from "next";
import { ComingSoon } from "@/features/tasks/components/coming-soon";

export const metadata: Metadata = { title: "My Activity" };

export default function Page() {
  return <ComingSoon title="My Activity" description="A history of your changes and tracked time arrives in a later phase." />;
}
