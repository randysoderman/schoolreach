"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { US_STATES } from "@/lib/states";
import { LEVELS, LEVEL_LABELS } from "@/lib/levels";
import {
  findWebsite,
  type BraveSearchHit,
  type FindWebsiteResult,
} from "./actions";

export function AddSchoolForm({
  formAction,
}: {
  formAction: (formData: FormData) => void;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FindWebsiteResult | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  function onFindWebsite() {
    const q = [name, city, state, "school"].filter(Boolean).join(" ").trim();
    setResult(null);
    start(async () => {
      setResult(await findWebsite(q));
    });
  }

  function selectResult(hit: BraveSearchHit) {
    setWebsiteUrl(hit.url);
  }

  return (
    <form action={formAction} className="space-y-5 rounded-md border p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="School name *" name="name" required value={name} onChange={setName} />
        <SelectField
          label="State *"
          name="state"
          required
          value={state}
          onChange={setState}
          options={[
            { value: "", label: "Choose…" },
            ...US_STATES.map((s) => ({ value: s.code, label: `${s.code} — ${s.name}` })),
          ]}
        />
        <SelectField
          label="Level *"
          name="level"
          required
          options={[
            { value: "", label: "Choose…" },
            ...LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] })),
          ]}
        />
        <Field label="City" name="city" value={city} onChange={setCity} />
        <Field label="District" name="district" />
      </div>

      <div className="space-y-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            Website URL
          </span>
          <div className="flex gap-2">
            <Input
              name="websiteUrl"
              type="url"
              placeholder="https://..."
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onFindWebsite}
              disabled={pending}
            >
              {pending ? "Searching…" : "Find website"}
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            Leave blank to let the scrape pipeline find it via Brave Search later.
          </span>
        </label>

        {result && !result.ok ? (
          <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {result.error}
          </p>
        ) : null}

        {result && result.ok ? (
          <div className="rounded border bg-muted/30 p-3 text-xs">
            <p className="mb-2 font-medium">Top results — click to use:</p>
            <ul className="space-y-1">
              {result.results.map((r) => (
                <li
                  key={r.url}
                  className="flex items-baseline justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => selectResult(r)}
                    className={
                      "text-left text-primary underline-offset-2 hover:underline " +
                      (websiteUrl === r.url ? "font-semibold" : "")
                    }
                  >
                    {r.title}
                  </button>
                  <span className="truncate text-muted-foreground">{r.url}</span>
                </li>
              ))}
            </ul>
            {result.best ? (
              <p className="mt-2 text-muted-foreground">
                Best guess:{" "}
                <button
                  type="button"
                  onClick={() => setWebsiteUrl(result.best!)}
                  className="text-primary hover:underline"
                >
                  {result.best}
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit">Create school</Button>
        <Link
          href="/schools"
          className="text-sm text-muted-foreground hover:underline"
        >
          Cancel
        </Link>
        <p className="text-xs text-muted-foreground">
          After creating, click <strong>Re-scrape</strong> on the school page to populate coaches + leadership.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  value,
  onChange,
}: {
  label: string;
  name: string;
  required?: boolean;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        name={name}
        required={required}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  required,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  required?: boolean;
  value?: string;
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        name={name}
        required={required}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        {options.map((o) => (
          <option key={`${name}-${o.value}`} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
