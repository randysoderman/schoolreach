"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startEmailEnrich } from "./actions";

export function EnrichEmailsButton({ schoolId }: { schoolId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onClick() {
    setMessage(null);
    start(async () => {
      const r = await startEmailEnrich(schoolId);
      setMessage(
        r.ok
          ? `Queued email guesses for ${r.missing} people. Refresh in a moment.`
          : r.error,
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? "Queueing…" : "Guess missing emails"}
      </Button>
      {message ? (
        <span className="text-xs text-muted-foreground">{message}</span>
      ) : null}
    </div>
  );
}
