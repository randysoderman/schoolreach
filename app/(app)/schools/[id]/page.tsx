import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { schools, people, scrapeJobs } from "@/lib/db/schema";
import { COACH_ROLES, teamGenderLabel } from "@/lib/sports";
import { levelLabel } from "@/lib/levels";
import { isUuid } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";
import { RescrapeButton } from "./rescrape-button";
import { EnrichEmailsButton } from "./enrich-emails-button";

export default async function SchoolDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isUuid(params.id)) notFound();

  const [school] = await db
    .select()
    .from(schools)
    .where(eq(schools.id, params.id))
    .limit(1);

  if (!school) notFound();

  const [personRows, recentJobs] = await Promise.all([
    db
      .select({
        id: people.id,
        fullName: people.fullName,
        title: people.title,
        roleCategory: people.roleCategory,
        coachRole: people.coachRole,
        teamGender: people.teamGender,
        sport: people.sport,
        email: people.email,
        emailStatus: people.emailStatus,
        verified: people.verified,
      })
      .from(people)
      .where(eq(people.schoolId, school.id))
      .orderBy(
        sql`${people.sport} asc nulls last`,
        sql`${people.teamGender} asc nulls last`,
        // role_category: coach before leader before staff
        sql`case ${people.roleCategory}
              when 'coach' then 1
              when 'leader' then 2
              when 'staff' then 3
              else 4
            end`,
        // coach_role: head before asst head before asst, others last
        sql`case ${people.coachRole}
              when 'head_coach' then 1
              when 'assistant_head_coach' then 2
              when 'assistant_coach' then 3
              else 4
            end`,
        asc(people.fullName),
      ),
    db
      .select()
      .from(scrapeJobs)
      .where(eq(scrapeJobs.schoolId, school.id))
      .orderBy(desc(scrapeJobs.createdAt))
      .limit(5),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/schools"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All schools
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {school.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[school.city, school.state].filter(Boolean).join(", ")} ·{" "}
          {levelLabel(school.level)} · scrape: {school.scrapeStatus ?? "pending"}
        </p>
      </div>

      <section className="rounded-md border">
        <header className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
          <h2 className="font-medium">School details</h2>
          <RescrapeButton
            schoolId={school.id}
            isRunning={school.scrapeStatus === "running"}
          />
        </header>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 text-sm md:grid-cols-2">
          <DetailRow label="NCES ID" value={school.ncesId} />
          <DetailRow label="District" value={school.district} />
          <DetailRow label="Address" value={school.streetAddress} />
          <DetailRow label="ZIP" value={school.zip} />
          <DetailRow
            label="Website"
            value={school.websiteUrl}
            link={school.websiteUrl ?? undefined}
          />
          <DetailRow
            label="Athletics URL"
            value={school.athleticsUrl}
            link={school.athleticsUrl ?? undefined}
          />
          <DetailRow
            label="Staff directory"
            value={school.staffDirectoryUrl}
            link={school.staffDirectoryUrl ?? undefined}
          />
          <DetailRow
            label="Enrollment"
            value={school.enrollment ? String(school.enrollment) : null}
          />
          <DetailRow label="Conference" value={school.conference} />
          <DetailRow label="Division" value={school.division} />
          <DetailRow label="Source" value={school.source} />
          <DetailRow
            label="Last scraped"
            value={
              school.lastScrapedAt
                ? new Date(school.lastScrapedAt).toLocaleString()
                : null
            }
          />
        </dl>
      </section>

      <section className="rounded-md border">
        <header className="border-b bg-muted/20 px-4 py-3">
          <h2 className="font-medium">Organization contacts</h2>
          <p className="text-xs text-muted-foreground">
            School-level (not individual) contact channels. Populated by the
            scrape pipeline when visible on the school site.
          </p>
        </header>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 text-sm md:grid-cols-2">
          <DetailRow label="Admin email" value={school.adminEmail} />
          <DetailRow label="Admin phone" value={school.adminPhone} />
          <DetailRow label="Athletics email" value={school.athleticsEmail} />
          <DetailRow label="Athletics phone" value={school.athleticsPhone} />
          <DetailRow label="Booster email" value={school.boosterEmail} />
          <DetailRow label="Booster phone" value={school.boosterPhone} />
          <DetailRow
            label="Booster website"
            value={school.boosterUrl}
            link={school.boosterUrl ?? undefined}
          />
        </dl>
      </section>

      <section className="rounded-md border">
        <header className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
          <div>
            <h2 className="font-medium">People</h2>
            <p className="text-xs text-muted-foreground">
              {personRows.length} total ·{" "}
              {personRows.filter((p) => p.email).length} with email
            </p>
          </div>
          <EnrichEmailsButton schoolId={school.id} />
        </header>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Sport</th>
              <th className="px-4 py-2">Gender</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Verified</th>
            </tr>
          </thead>
          <tbody>
            {personRows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-muted-foreground"
                  colSpan={6}
                >
                  No people scraped yet.
                </td>
              </tr>
            ) : (
              personRows.map((p) => {
                // Smart Role display: for coaches show their coach_role
                // label (Head Coach / Assistant Coach); for non-coaches
                // show their full title (Athletic Director, etc.).
                const roleLabel =
                  p.roleCategory === "coach"
                    ? COACH_ROLES.find((r) => r.value === p.coachRole)?.label ??
                      p.title ??
                      "Coach"
                    : p.title ?? p.roleCategory;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2">
                      <Link
                        href={`/people/${p.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.sport ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {teamGenderLabel(p.teamGender, school.level) ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {roleLabel}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.email ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      {p.verified ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                          verified
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-md border">
        <header className="border-b bg-muted/20 px-4 py-3">
          <h2 className="font-medium">Recent scrape jobs</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Pages</th>
              <th className="px-4 py-2">People</th>
              <th className="px-4 py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {recentJobs.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-muted-foreground"
                  colSpan={6}
                >
                  No scrape attempts yet.
                </td>
              </tr>
            ) : (
              recentJobs.map((j) => (
                <tr key={j.id} className="border-t">
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(j.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill value={j.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {j.stage ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {j.pagesFetched ?? 0}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {j.peopleFound ?? 0}
                  </td>
                  <td className="px-4 py-2 text-xs text-destructive">
                    {j.errorMessage ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
  link,
}: {
  label: string;
  value: string | null | undefined;
  link?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">
        {value ? (
          link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  );
}
