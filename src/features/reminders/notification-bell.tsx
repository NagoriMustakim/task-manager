"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Badge from "@mui/material/Badge";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";
import { useToast } from "@/features/tasks/components/toast";
import { clearNotificationsAction, markNotificationsReadAction, syncRemindersAction, type NotificationDTO } from "./actions";

const POLL_MS = 60_000;

/**
 * In-app reminder inbox. While the app is open and visible it asks the server about once a minute
 * which reminders are due. Nothing is delivered when the app is closed (no push or email is configured).
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const [failed, setFailed] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const { notify } = useToast();

  const sync = useCallback(async () => {
    const r = await syncRemindersAction();
    if (!r.ok) { setFailed(true); return; }
    setFailed(false);
    setItems(r.data.items);
    setUnread(r.data.unread);
    if (seen.current === null) seen.current = new Set(r.data.items.map((i) => i.id));
    else for (const id of r.data.created) {
      if (seen.current.has(id)) continue;
      seen.current.add(id);
      const n = r.data.items.find((i) => i.id === id);
      if (n) notify(n.title);
    }
  }, [notify]);

  useEffect(() => {
    void sync();
    const tick = () => { if (document.visibilityState === "visible") void sync(); };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, [sync]);

  const markAll = async () => {
    setItems((l) => l.map((i) => ({ ...i, read: true })));
    setUnread(0);
    await markNotificationsReadAction();
  };

  return (
    <>
      <Tooltip title="Reminders">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} aria-label={unread ? `Reminders, ${unread} unread` : "Reminders"} aria-expanded={open} aria-haspopup="dialog">
          <Badge badgeContent={unread} color="error" max={9}>
            <NotificationsNoneOutlined fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { role: "dialog", "aria-label": "Reminders", sx: { width: 340, maxWidth: "calc(100vw - 24px)", mt: 0.5 } } }}
      >
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-[13px] font-semibold">Reminders</h2>
          <div className="flex gap-1">
            <Button size="small" disabled={unread === 0} onClick={() => void markAll()}>Mark all read</Button>
            <Button size="small" color="inherit" disabled={items.length === 0} onClick={async () => { setItems([]); setUnread(0); await clearNotificationsAction(); }}>Clear</Button>
          </div>
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {items.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-ink-muted">No reminders.</li> : null}
          {items.map((n) => (
            <li key={n.id} className="border-b border-line last:border-0">
              <Link
                href={n.link ?? "/today"}
                onClick={() => { setAnchor(null); if (!n.read) void markNotificationsReadAction([n.id]).then(() => sync()); }}
                className={`block px-3 py-2 text-[13px] hover:bg-canvas ${n.read ? "text-ink-muted" : ""}`}
              >
                <span className={n.read ? "" : "font-medium"}>{n.title}</span>
                {n.body ? <span className="block text-xs text-ink-muted">{n.body}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-3 py-2 text-[11px] text-ink-muted">
          {failed ? "Couldn't check for new reminders. " : ""}Reminders appear here while the app is open. <Link href="/settings" onClick={() => setAnchor(null)} className="text-accent hover:underline">Settings</Link>
        </p>
      </Popover>
    </>
  );
}
