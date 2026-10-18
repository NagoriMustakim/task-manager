import {
  IconActivity, IconArchive, IconBack, IconTarget, IconCheck, IconRepeat, IconDownload, IconCalendar, IconChart, IconList, IconSettings, IconShield, IconToday, IconUpcoming,
} from "@/features/tasks/components/icons";

export const NAV = [
  { href: "/today", label: "Today", icon: IconToday, primary: true },
  { href: "/yesterday", label: "Yesterday", icon: IconBack },
  { href: "/upcoming", label: "Upcoming", icon: IconUpcoming, primary: true },
  { href: "/calendar", label: "Calendar", icon: IconCalendar },
  { href: "/all", label: "All Tasks", icon: IconList, primary: true },
  { href: "/archived", label: "Archived", icon: IconArchive },
  { href: "/analytics", label: "Analytics", icon: IconChart },
  { href: "/goals", label: "Goals", icon: IconTarget },
  { href: "/routines", label: "Routines", icon: IconRepeat },
  { href: "/review", label: "Daily review", icon: IconCheck },
  { href: "/review/week", label: "Weekly review", icon: IconCheck },
  { href: "/activity", label: "My Activity", icon: IconActivity },
  { href: "/export", label: "Export", icon: IconDownload },
  { href: "/settings", label: "Settings", icon: IconSettings },
] as const;

export const ADMIN_NAV = { href: "/admin", label: "Administration", icon: IconShield } as const;
