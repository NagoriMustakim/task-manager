"use client";

import Button from "@mui/material/Button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <Button variant="outlined" color="inherit" onClick={reset}>Try again</Button>
    </main>
  );
}
