import { createTheme } from "@mui/material/styles";

/**
 * One MUI theme for the whole app. Light and dark palettes are emitted as CSS variables and switched by
 * the `data-mui-color-scheme` attribute on <html>; globals.css maps the Tailwind tokens to the same attribute.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data-mui-color-scheme" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#4f5bd5" },
        secondary: { main: "#5f6370" },
        error: { main: "#c0392b" },
        warning: { main: "#b45309" },
        success: { main: "#1f7a4d" },
        info: { main: "#0b6fb8" },
        background: { default: "#fbfbfc", paper: "#ffffff" },
        text: { primary: "#16171a", secondary: "#5f6370" },
        divider: "#e6e7ea",
      },
    },
    dark: {
      palette: {
        primary: { main: "#8f99ff" },
        secondary: { main: "#9aa0ad" },
        error: { main: "#ff7b6e" },
        warning: { main: "#f5a54a" },
        success: { main: "#4cc38a" },
        info: { main: "#5db8ff" },
        background: { default: "#0f1115", paper: "#171a21" },
        text: { primary: "#e8eaee", secondary: "#9aa0ad" },
        divider: "#2a2e38",
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    fontSize: 14,
    button: { textTransform: "none", fontWeight: 500 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTextField: { defaultProps: { size: "small", variant: "outlined" } },
    MuiSelect: { defaultProps: { size: "small" } },
    MuiFormControl: { defaultProps: { size: "small" } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});
