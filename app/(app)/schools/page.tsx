import Link from "next/link";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  schools,
  type SchoolLevel,
  type ScrapeStatus,
} from "@/lib/db/schema";
import { US_STATES } from "@/lib/states";
import { LEVELS, LEVEL_LABELS, levelLabel } from "@/lib/levels";
import { CONFERENCES, DIVISIONS } from "@/lib/conferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect, parseMultiParam } from "@/components/ui/multi-select";
import { StatusPill } from "@/components/ui/status-pill";
import { Pager } from "@/components/ui/pager";
import { PAGE_SIZE, parsePageParam } from "@/lib/pagination";
import { BulkScrapeBar, SchoolSelectCheckbox } from "./bulk-scrape";

const STATUSES: ScrapeStatus[] = [
  "pending",
  "running",
  "success",
  "failed",
  "skipped",
];

type Search = {
  q?: string;
  state?: string;
  level?: string;
  status?: string;
  conference?: string;
  division?: string;
  page?: string;
};

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const page = parsePageParam(searchParams.page);
  const q = searchParams.q?.trim() ?? "";
  const filters = [];
  if (q) {
    const pattern = `%${q}%`;
    filters.push(
      or(
        ilike(schools.name, pattern),
        ilike(schools.city, pattern),
        ilike(schools.district, pattern),
      )!,
    );
  }
  const stateValues = parseMultiParam(searchParams.state);
  const levelValues = parseMultiParam(searchParams.level) as SchoolLevel[];
  const statusValues = parseMultiParam(searchParams.status) as ScrapeStatus[];
  const conferenceValues = parseMultiParam(searchParams.conference);
  const divisionValues = parseMultiParam(searchParams.division);

  if (stateValues.length) filters.push(inArray(schools.state, stateValues));
  if (levelValues.length) filters.push(inArray(schools.level, levelValues));
  if (statusValues.length)
    filters.push(inArray(schools.scrapeStatus, statusValues));
  if (conferenceValues.length)
    filters.push(inArray(schools.conference, conferenceValues));
  if (divisionValues.length)
    filters.push(inArray(schools.division, divisionValues));
  const whereClause = filters.length ? and(...filters) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: schools.id,
        name: schools.name,
        state: schools.state,
        level: schools.level,
        city: schools.city,
        scrapeStatus: schools.scrapeStatus,
        lastScrapedAt: schools.lastScrapedAt,
      })
      .from(schools)
      .where(whereClause)
      .orderBy(desc(schools.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(schools)
      .where(whereClause),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Schools</h1>
          <p className="text-sm text-muted-foreground">
            {total} total · page {page} of {totalPages}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/schools/add">
            <Button variant="outline">Add a school</Button>
          </Link>
          <Link href="/schools/discover">
            <Button>Discover schools</Button>
          </Link>
        </div>
      </div>

      <form
        action="/schools"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/20 p-4"
      >
        <label className="flex flex-1 min-w-[14rem] flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Search</span>
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name, city, or district…"
            className="h-9"
          />
        </label>
        <MultiSelect
          name="state"
          label="State"
          defaultValue={searchParams.state}
          options={US_STATES.map((s) => ({ value: s.code, label: s.code }))}
        />
        <MultiSelect
          name="level"
          label="Level"
          defaultValue={searchParams.level}
          options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
        />
        <MultiSelect
          name="status"
          label="Scrape status"
          defaultValue={searchParams.status}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <MultiSelect
          name="division"
          label="Division"
          defaultValue={searchParams.division}
          options={DIVISIONS.map((d) => ({ value: d.value, label: d.label }))}
        />
        <MultiSelect
          name="conference"
          label="Conference"
          defaultValue={searchParams.conference}
          minWidth="14rem"
          options={CONFERENCES.map((c) => ({ value: c.value, label: c.label }))}
        />
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Link
          href="/schools"
          className="text-sm text-muted-foreground hover:underline"
        >
          Clear
        </Link>
      </form>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Level</th>
              <th className="px-4 py-2">State</th>
              <th className="px-4 py-2">City</th>
              <th className="px-4 py-2">Scrape</th>
              <th className="px-4 py-2">Last scraped</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-muted-foreground"
                  colSpan={7}
                >
                  No schools match these filters.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2">
                    <SchoolSelectCheckbox id={s.id} />
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/schools/${s.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {levelLabel(s.level)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{s.state}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {s.city ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill value={s.scrapeStatus ?? "pending"} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {s.lastScrapedAt
                      ? new Date(s.lastScrapedAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pager
        basePath="/schools"
        searchParams={searchParams}
        page={page}
        totalPages={totalPages}
      />

      <BulkScrapeBar schoolIds={rows.map((r) => r.id)} />
    </div>
  );
}

