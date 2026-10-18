"use client";

import Button from "@mui/material/Button";

export default function TasksError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-6 py-8 text-center">
      <p className="font-medium text-danger">Couldn&apos;t load your tasks.</p>
      <Button variant="outlined" color="inherit" onClick={reset}>Try again</Button>
    </div>
  );
}
