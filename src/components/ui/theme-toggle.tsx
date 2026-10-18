"use client";

import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useColorScheme } from "@mui/material/styles";

/** Switches between light and dark. Until the stored preference is read on the client, renders an inert placeholder. */
export function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const resolved = mode === "system" ? systemMode : mode;
  const dark = resolved === "dark";
  return (
    <Tooltip title={dark ? "Switch to light mode" : "Switch to dark mode"}>
      <span>
        <IconButton
          size="small"
          disabled={!resolved}
          onClick={() => setMode(dark ? "light" : "dark")}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
