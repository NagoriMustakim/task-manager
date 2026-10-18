import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppThemeProvider } from "@/theme/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = { title: { default: "Tracker", template: "%s · Tracker" } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript defaultMode="system" />
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
