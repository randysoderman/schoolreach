import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { discoveryJobs } from "@/lib/db/schema";
import { US_STATES } from "@/lib/states";
import { LEVELS, LEVEL_LABELS } from "@/lib/levels";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { isUuid } from "@/lib/utils";
import { cancelDiscoveryJob, startDiscovery } from "./actions";

type Search = {
  job?: string;
  error?: string;
  all?: string;
  forcedDryRun?: string;
};

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const recent = await db
    .select()
    .from(discoveryJobs)
    .orderBy(desc(discoveryJobs.createdAt))
    .limit(10);

  const focusedJob = isUuid(searchParams.job)
    ? (
        await db
          .select()
          .from(discoveryJobs)
          .where(eq(discoveryJobs.id, searchParams.job))
          .limit(1)
      )[0]
    : null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/schools"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Schools
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Discover schools
        </h1>
        <p className="text-sm text-muted-foreground">
          Pull from the Urban Institute education data API (NCES + IPEDS, 2022).
          Use Dry run to preview counts without inserting.
        </p>
      </div>

      {searchParams.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}

      {searchParams.all ? (
        <p className="rounded-md border bg-muted/40 p-3 text-sm">
          Queued discovery for all 50 states + DC.
          {searchParams.forcedDryRun
            ? " Forced into dry-run mode — re-submit with the confirm box checked to actually insert."
            : " Real-insert mode active. Watch the table below for per-state progress."}
        </p>
      ) : null}

      {focusedJob ? (
        <section className="rounded-md border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Job {focusedJob.id.slice(0, 8)}</h2>
            <StatusPill value={focusedJob.status} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            <Row k="State" v={focusedJob.state} />
            <Row k="Levels" v={focusedJob.levels.join(", ")} />
            <Row k="Mode" v={focusedJob.dryRun ? "dry run" : "insert"} />
            <Row
              k="Discovered"
              v={String(focusedJob.schoolsDiscovered ?? 0)}
            />
            <Row
              k={focusedJob.dryRun ? "Would insert" : "Inserted"}
              v={String(focusedJob.schoolsEnqueued ?? 0)}
            />
            <Row
              k="Started"
              v={
                focusedJob.startedAt
                  ? new Date(focusedJob.startedAt).toLocaleString()
                  : "—"
              }
            />
            <Row
              k="Finished"
              v={
                focusedJob.completedAt
                  ? new Date(focusedJob.completedAt).toLocaleString()
                  : "—"
              }
            />
          </dl>
          {focusedJob.errorMessage ? (
            <p className="mt-3 rounded bg-destructive/10 p-2 text-xs text-destructive">
              {focusedJob.errorMessage}
            </p>
          ) : null}
          {focusedJob.status === "queued" || focusedJob.status === "running" ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Job is in progress.{" "}
                <Link
                  href={`/schools/discover?job=${focusedJob.id}`}
                  className="text-primary hover:underline"
                >
                  Refresh
                </Link>{" "}
                for an update.
              </p>
              <form action={cancelDiscoveryJob.bind(null, focusedJob.id)}>
                <Button type="submit" variant="destructive" size="sm">
                  Cancel job
                </Button>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}

      <form
        action={startDiscovery}
        className="space-y-5 rounded-md border p-6"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              State *
            </span>
            <select
              name="state"
              required
              defaultValue=""
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="" disabled>
                Choose a state
              </option>
              <option value="ALL">All states (50 + DC)</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirmAll" className="h-4 w-4" />
          I confirm I want to discover across <strong>all</strong> states (only
          relevant if "All states" is selected). Without this, all-states runs
          are forced into dry-run mode.
        </label>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">
            Levels *
          </legend>
          <div className="grid gap-2 md:grid-cols-3">
            {LEVELS.map((l) => (
              <label
                key={l}
                className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="levels"
                  value={l}
                  className="h-4 w-4"
                />
                {LEVEL_LABELS[l]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            College / University rows come from IPEDS. K-12 levels come from
            CCD. Pick whichever combinations you want.
          </p>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dryRun" className="h-4 w-4" defaultChecked />
          Dry run (don't insert — just count)
        </label>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit">Discover</Button>
          <p className="text-xs text-muted-foreground">
            Make sure the Inngest dev server is running:{" "}
            <code className="rounded bg-muted px-1">npm run inngest:dev</code>
          </p>
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent discovery jobs</h2>
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2">Levels</th>
                <th className="px-4 py-2">Mode</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Found</th>
                <th className="px-4 py-2">Inserted</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No discovery jobs yet.
                  </td>
                </tr>
              ) : (
                recent.map((j) => (
                  <tr key={j.id} className="border-t">
                    <td className="px-4 py-2 text-muted-foreground">
                      <Link
                        href={`/schools/discover?job=${j.id}`}
                        className="text-primary hover:underline"
                      >
                        {new Date(j.createdAt).toLocaleString()}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {j.state}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {j.levels.join(", ")}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {j.dryRun ? "dry" : "insert"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill value={j.status} />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {j.schoolsDiscovered ?? 0}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {j.schoolsEnqueued ?? 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {k}
      </dt>
      <dd className="text-sm">{v}</dd>
    </div>
  );
}

