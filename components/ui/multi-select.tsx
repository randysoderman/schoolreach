"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { value: string; label: string };

/**
 * Multi-select dropdown. No Radix dep — pure HTML/Tailwind/React state.
 *
 * Stores selected values as a comma-separated string in a single hidden
 * `<input name>` so it submits cleanly with a plain GET form. Empty
 * string means "no filter applied".
 *
 * Usage:
 *   <MultiSelect name="sport" label="Sport" defaultValue={searchParams.sport ?? ""}
 *     options={SPORTS.map((s) => ({ value: s, label: s }))} />
 */
export function MultiSelect({
  name,
  label,
  defaultValue,
  options,
  placeholder = "Any",
  minWidth = "10rem",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: MultiSelectOption[];
  placeholder?: string;
  minWidth?: string;
}) {
  const initialSelected = parseCsv(defaultValue);
  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const csv = Array.from(selected).join(",");
  const summary = renderSummary(selected, options, placeholder);

  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      <span className="text-muted-foreground">{label}</span>
      <div ref={rootRef} className="relative" style={{ minWidth }}>
        <input type="hidden" name={name} value={csv} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-2 text-left text-sm",
            selected.size === 0 && "text-muted-foreground",
          )}
        >
          <span className="truncate">{summary}</span>
          <span className="ml-2 text-xs text-muted-foreground">▾</span>
        </button>
        {open ? (
          <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md">
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Clear selection
              </button>
            ) : null}
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent hover:text-accent-foreground"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function parseCsv(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
}

function renderSummary(
  selected: Set<string>,
  options: MultiSelectOption[],
  placeholder: string,
): string {
  if (selected.size === 0) return placeholder;
  const labels = options
    .filter((o) => selected.has(o.value))
    .map((o) => o.label);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels[0]} +${labels.length - 1} more`;
}

/** Parse a comma-separated search param into an array. */
export function parseMultiParam(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
