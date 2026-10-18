"use client";

import MuiPopover from "@mui/material/Popover";
import MenuItem from "@mui/material/MenuItem";
import MenuList from "@mui/material/MenuList";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { useId, useRef, useState, type ReactNode } from "react";

/**
 * Accessible popover (MUI): the trigger toggles it, Escape and outside clicks close it and focus
 * returns to the trigger. It renders in a portal, so it is never clipped by a list or card.
 */
export function Popover({
  label,
  trigger,
  children,
  align = "left",
}: {
  label: string;
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog"; "aria-controls": string }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const close = () => setOpen(false);

  return (
    <>
      <span ref={root} data-popover-trigger-wrap className="inline-flex">
        {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "dialog", "aria-controls": id })}
      </span>
      <MuiPopover
        id={id}
        open={open}
        anchorEl={root.current}
        // Inside a modal <dialog> the portal must live in the dialog, or the popover would sit under its top layer.
        container={() => root.current?.closest("dialog") ?? document.body}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: align }}
        transformOrigin={{ vertical: "top", horizontal: align }}
        slotProps={{ paper: { role: "dialog", "aria-label": label, sx: { mt: 0.5, p: 0.75, maxWidth: "min(22rem, calc(100vw - 2rem))" } } }}
        onClick={(e) => e.stopPropagation()}
      >
        {open ? children(close) : null}
      </MuiPopover>
    </>
  );
}

/** Arrow-key navigable list of choices inside a popover. */
export function ChoiceList<T extends string>({
  value,
  options,
  onPick,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode; hint?: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <MenuList autoFocusItem role="radiogroup" sx={{ minWidth: 170, p: 0 }}>
      {options.map((o) => (
        <MenuItem key={o.value} role="radio" aria-checked={o.value === value} selected={o.value === value} onClick={() => onPick(o.value)} dense>
          {o.icon ? <ListItemIcon sx={{ minWidth: 30 }}>{o.icon}</ListItemIcon> : null}
          <ListItemText>{o.label}</ListItemText>
          {o.hint ? <Typography variant="caption" color="text.secondary" component="kbd" sx={{ ml: 2 }}>{o.hint}</Typography> : null}
        </MenuItem>
      ))}
    </MenuList>
  );
}
