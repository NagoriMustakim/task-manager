import type { SVGProps } from "react";

const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
type P = SVGProps<SVGSVGElement>;

export const IconToday = (p: P) => (<svg {...base} {...p}><rect x="2.5" y="3" width="11" height="10.5" rx="2" /><path d="M2.5 6.5h11M5.5 1.5v3M10.5 1.5v3" /></svg>);
export const IconBack = (p: P) => (<svg {...base} {...p}><path d="M6.5 3.5 2.5 7.5l4 4M2.5 7.5h8a3 3 0 0 1 0 6H8" /></svg>);
export const IconUpcoming = (p: P) => (<svg {...base} {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></svg>);
export const IconCalendar = (p: P) => (<svg {...base} {...p}><rect x="2.5" y="3" width="11" height="10.5" rx="2" /><path d="M2.5 6.5h11M5.5 1.5v3M10.5 1.5v3M5.5 9h1M9.5 9h1M5.5 11.5h1" /></svg>);
export const IconList = (p: P) => (<svg {...base} {...p}><path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" /></svg>);
export const IconChart = (p: P) => (<svg {...base} {...p}><path d="M2.5 13.5h11M4.5 11V8M8 11V4M11.5 11V6.5" /></svg>);
export const IconActivity = (p: P) => (<svg {...base} {...p}><path d="M1.5 8h3l2-5 3 10 2-5h3" /></svg>);
export const IconSettings = (p: P) => (<svg {...base} {...p}><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" /></svg>);
export const IconShield = (p: P) => (<svg {...base} {...p}><path d="M8 1.5 3 3.5v4c0 3 2 5.5 5 7 3-1.5 5-4 5-7v-4z" /></svg>);
export const IconTarget = (p: P) => (<svg {...base} {...p}><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2.2" /></svg>);
export const IconCheck = (p: P) => (<svg {...base} {...p}><path d="m3 8.5 3.2 3.2L13 4.8" /></svg>);
export const IconRepeat = (p: P) => (<svg {...base} {...p}><path d="M3 7V6a2 2 0 0 1 2-2h7M10.5 1.5 13 4l-2.5 2.5M13 9v1a2 2 0 0 1-2 2H4M5.5 14.5 3 12l2.5-2.5" /></svg>);
export const IconDownload = (p: P) => (<svg {...base} {...p}><path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>);
export const IconBell = (p: P) => (<svg {...base} {...p}><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3zM6.5 14a1.5 1.5 0 0 0 3 0" /></svg>);
export const IconPlus = (p: P) => (<svg {...base} {...p}><path d="M8 3v10M3 8h10" /></svg>);
export const IconMenu = (p: P) => (<svg {...base} {...p}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></svg>);
export const IconChevron = (p: P) => (<svg {...base} {...p}><path d="m4 6 4 4 4-4" /></svg>);
export const IconLeft = (p: P) => (<svg {...base} {...p}><path d="m10 3.5-4.5 4.5 4.5 4.5" /></svg>);
export const IconRight = (p: P) => (<svg {...base} {...p}><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>);
export const IconSearch = (p: P) => (<svg {...base} {...p}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>);
export const IconClock = (p: P) => (<svg {...base} {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></svg>);
export const IconArchive = (p: P) => (<svg {...base} {...p}><rect x="2" y="3" width="12" height="3" rx="1" /><path d="M3 6v6.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6M6.5 9h3" /></svg>);

/** Status glyph: ring / half / check / slash. */
export function StatusGlyph({ status, className }: { status: "new" | "pending" | "done" | "incomplete"; className?: string }) {
  const c = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", "aria-hidden": true, className } as const;
  switch (status) {
    case "new":
      return (<svg {...c}><circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.5" /></svg>);
    case "pending":
      return (<svg {...c}><circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.5" /><path d="M9 4.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" /></svg>);
    case "done":
      return (<svg {...c}><circle cx="9" cy="9" r="7" fill="currentColor" /><path d="m5.9 9.2 2.2 2.2 4-4.3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
    case "incomplete":
      return (<svg {...c}><circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.5" /><path d="m6.5 11.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>);
  }
}
export const IconTrash = (p: P) => (<svg {...base} {...p}><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5l.5 8.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" /></svg>);
