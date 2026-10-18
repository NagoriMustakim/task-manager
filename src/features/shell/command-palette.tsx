"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { requestNewTask } from "@/lib/new-task";
import { ADMIN_NAV, NAV } from "./nav";
import { signOutAction } from "@/features/auth/actions";

interface Command { id: string; label: string; hint?: string; run: () => void }

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function GlobalShortcuts({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "n") { e.preventDefault(); requestNewTask((h) => router.push(h)); }
      else if (e.key === "?") { e.preventDefault(); setHelpOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [...NAV, ...(isAdmin ? [ADMIN_NAV] : [])].map((n) => ({
      id: n.href, label: `Go to ${n.label}`, run: () => router.push(n.href),
    }));
    return [
      { id: "new", label: "New task", hint: "N", run: () => requestNewTask((h) => router.push(h)) },
      { id: "undo", label: "Undo last change", hint: "Z", run: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "z" })) },
      ...nav,
      { id: "help", label: "Keyboard shortcuts", hint: "?", run: () => setHelpOpen(true) },
      { id: "signout", label: "Sign out", run: () => void signOutAction() },
    ];
  }, [isAdmin, router]);

  return (
    <>
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handler = () => onClose();
    d.addEventListener("close", handler);
    return () => d.removeEventListener("close", handler);
  }, [onClose]);
  return ref;
}

function Palette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const ref = useDialog(open, onClose);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  useEffect(() => { if (open) { setQ(""); setActive(0); } }, [open]);
  useEffect(() => setActive(0), [q]);

  const run = (c: Command | undefined) => { if (!c) return; onClose(); setTimeout(c.run, 0); };

  return (
    <dialog
      ref={ref}
      aria-label="Command palette"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="m-auto mt-[15vh] w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 shadow-xl backdrop:bg-black/30"
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        role="combobox"
        aria-expanded
        aria-controls="palette-list"
        aria-activedescendant={filtered[active] ? `cmd-${filtered[active]!.id}` : undefined}
        aria-label="Type a command"
        placeholder="Type a command…"
        className="h-12 w-full rounded-t-xl border-b border-line bg-transparent px-4 text-sm focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); run(filtered[active]); }
        }}
      />
      <ul id="palette-list" role="listbox" className="max-h-72 overflow-y-auto p-1.5">
        {filtered.length === 0 ? <li className="px-3 py-6 text-center text-ink-muted">No matching commands.</li> : null}
        {filtered.map((c, i) => (
          <li
            key={c.id}
            id={`cmd-${c.id}`}
            role="option"
            aria-selected={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => run(c)}
            className="flex cursor-pointer items-center justify-between rounded-control px-3 py-2 text-sm aria-selected:bg-canvas"
          >
            {c.label}
            {c.hint ? <kbd className="text-[11px] text-ink-muted">{c.hint}</kbd> : null}
          </li>
        ))}
      </ul>
    </dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ["N", "New task"], ["⌘/Ctrl K", "Command palette"], ["J / K or ↑ ↓", "Move between tasks"],
  ["Space or X", "Toggle done"], ["P", "Mark pending"], ["I", "Mark incomplete"],
  ["1 – 4", "Set priority low → urgent"], ["E or Enter", "Edit title"], ["O", "Show details"],
  ["# or Delete", "Archive task"], ["Z or ⌘/Ctrl Z", "Undo"], ["?", "This help"],
];

function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useDialog(open, onClose);
  return (
    <dialog ref={ref} aria-label="Keyboard shortcuts" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-5 shadow-xl backdrop:bg-black/30">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
        <button onClick={onClose} className="rounded-control px-2 py-1 text-[13px] hover:bg-canvas" autoFocus>Close</button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        {SHORTCUTS.map(([k, d]) => (<div key={k} className="contents"><dt><kbd className="rounded border border-line-strong bg-canvas px-1.5 py-0.5 text-xs">{k}</kbd></dt><dd className="text-ink-muted">{d}</dd></div>))}
      </dl>
    </dialog>
  );
}
