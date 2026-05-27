"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelScrape, startScrape } from "./actions";

export function RescrapeButton({
  schoolId,
  isRunning,
}: {
  schoolId: string;
  isRunning: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  function onScrape() {
    setMessage(null);
    start(async () => {
      const r = await startScrape(schoolId, force);
      setMessage(
        r.ok ? "Scrape queued — refresh in a moment for status." : r.error,
      );
    });
  }

  function onCancel() {
    setMessage(null);
    start(async () => {
      const r = await cancelScrape(schoolId);
      setMessage(
        r.ok
          ? `Cancelled ${r.cancelled} running job(s).`
          : r.error,
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="h-3.5 w-3.5"
            disabled={pending}
          />
          Force re-scrape (override 30-day cooldown)
        </label>
        {isRunning ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            {pending ? "…" : "Cancel running scrape"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onScrape}
          disabled={pending}
        >
          {pending ? "Queueing…" : "Re-scrape"}
        </Button>
      </div>
      {message ? (
        <span className="text-xs text-muted-foreground">{message}</span>
      ) : null}
    </div>
  );
}
