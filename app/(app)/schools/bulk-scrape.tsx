"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkScrape, type BulkScrapeResult } from "./actions";

export function BulkScrapeBar({ schoolIds }: { schoolIds: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [force, setForce] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BulkScrapeResult | null>(null);

  // The checkboxes in the table fire a `bulk-scrape-toggle` custom event
  // on the document with detail = { id, checked }. We listen here so we
  // don't have to lift the whole table into client state.
  if (typeof document !== "undefined") {
    document.removeEventListener("bulk-scrape-toggle", handleToggle as never);
    document.addEventListener("bulk-scrape-toggle", handleToggle as never);
  }

  function handleToggle(e: CustomEvent<{ id: string; checked: boolean }>) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.detail.checked) next.add(e.detail.id);
      else next.delete(e.detail.id);
      return next;
    });
  }

  function onClick() {
    if (selected.size === 0) return;
    setResult(null);
    start(async () => {
      const r = await bulkScrape(Array.from(selected), force);
      setResult(r);
      setSelected(new Set()); // clear checkboxes (purely UX)
    });
  }

  if (schoolIds.length === 0) return null;
  if (selected.size === 0 && !result) return null;

  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 rounded-md border bg-background p-3 shadow-lg">
      <div className="text-sm">
        <strong>{selected.size}</strong> school
        {selected.size === 1 ? "" : "s"} selected
        {result ? (
          <span className="ml-3 text-xs text-muted-foreground">
            Queued {result.queued} · Skipped {result.skipped}
            {result.notFound ? ` · Not found ${result.notFound}` : ""}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="h-3.5 w-3.5"
            disabled={pending}
          />
          Force (override 30-day cooldown)
        </label>
        <Button
          type="button"
          size="sm"
          onClick={onClick}
          disabled={pending || selected.size === 0}
        >
          {pending ? "Queueing…" : `Scrape ${selected.size} selected`}
        </Button>
      </div>
    </div>
  );
}

// Small wrapper rendered per-row in the schools table.
export function SchoolSelectCheckbox({ id }: { id: string }) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4"
      onChange={(e) => {
        document.dispatchEvent(
          new CustomEvent("bulk-scrape-toggle", {
            detail: { id, checked: e.target.checked },
          }),
        );
      }}
    />
  );
}
