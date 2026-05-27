import Link from "next/link";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  people,
  schools,
  type RoleCategory,
  type TeamGender,
} from "@/lib/db/schema";
import { US_STATES } from "@/lib/states";
import {
  COACH_ROLES,
  SPORTS,
  teamGenderLabel,
} from "@/lib/sports";
import { Button } from "@/components/ui/button";
import { MultiSelect, parseMultiParam } from "@/components/ui/multi-select";
import { Pager } from "@/components/ui/pager";
import { PAGE_SIZE, parsePageParam } from "@/lib/pagination";

const ROLES: RoleCategory[] = ["coach", "leader", "staff"];
const TEAM_GENDERS: TeamGender[] = ["mens", "womens", "coed"];

type Search = {
  role?: string;
  coach_role?: string;
  team_gender?: string;
  sport?: string;
  state?: string;
  has_email?: string;
  review?: string;
  page?: string;
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const page = parsePageParam(searchParams.page);
  const roleValues = parseMultiParam(searchParams.role) as RoleCategory[];
  const coachRoleValues = parseMultiParam(searchParams.coach_role);
  const teamGenderValues = parseMultiParam(searchParams.team_gender) as TeamGender[];
  const sportValues = parseMultiParam(searchParams.sport);
  const stateValues = parseMultiParam(searchParams.state);

  const filters = [];
  if (roleValues.length) filters.push(inArray(people.roleCategory, roleValues));
  if (coachRoleValues.length)
    filters.push(inArray(people.coachRole, coachRoleValues));
  if (teamGenderValues.length)
    filters.push(inArray(people.teamGender, teamGenderValues));
  if (sportValues.length) filters.push(inArray(people.sport, sportValues));
  if (stateValues.length) filters.push(inArray(schools.state, stateValues));
  const hasEmailValues = parseMultiParam(searchParams.has_email);
  if (hasEmailValues.length === 1 && hasEmailValues[0] === "yes")
    filters.push(isNotNull(people.email));
  if (hasEmailValues.length === 1 && hasEmailValues[0] === "no")
    filters.push(isNull(people.email));
  if (parseMultiParam(searchParams.review).includes("yes")) {
    // "Needs review" = low confidence OR unverified email status OR unverified flag
    const lowConf = lt(people.confidenceScore, "0.85");
    const unknownEmail = eq(people.emailStatus, "unknown");
    const combined = or(lowConf, unknownEmail);
    if (combined) filters.push(combined);
  }
  const whereClause = filters.length ? and(...filters) : undefined;

  const [rows, [{ total }]] = await Promise.all([
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
        schoolId: schools.id,
        schoolName: schools.name,
        schoolLevel: schools.level,
        state: schools.state,
      })
      .from(people)
      .leftJoin(schools, eq(people.schoolId, schools.id))
      .where(whereClause)
      .orderBy(
        sql`${people.sport} asc nulls last`,
        sql`${people.teamGender} asc nulls last`,
        sql`case ${people.roleCategory}
              when 'coach' then 1
              when 'leader' then 2
              when 'staff' then 3
              else 4
            end`,
        sql`case ${people.coachRole}
              when 'head_coach' then 1
              when 'assistant_head_coach' then 2
              when 'assistant_coach' then 3
              else 4
            end`,
        asc(people.fullName),
      )
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(people)
      .leftJoin(schools, eq(people.schoolId, schools.id))
      .where(whereClause),
  ]);

  const sportOptions = SPORTS.map((s) => ({ value: s, label: s }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">People</h1>
        <p className="text-sm text-muted-foreground">
          {total} total · page {page} of {totalPages}
        </p>
      </div>

      <form
        action="/people"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/20 p-4"
      >
        <MultiSelect
          name="role"
          label="Role"
          defaultValue={searchParams.role}
          options={ROLES.map((r) => ({ value: r, label: r }))}
        />
        <MultiSelect
          name="coach_role"
          label="Coach role"
          defaultValue={searchParams.coach_role}
          options={COACH_ROLES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <MultiSelect
          name="team_gender"
          label="Gender"
          defaultValue={searchParams.team_gender}
          options={TEAM_GENDERS.map((g) => ({
            value: g,
            label: g === "mens" ? "Mens / Boys" : g === "womens" ? "Womens / Girls" : "Coed",
          }))}
        />
        <MultiSelect
          name="sport"
          label="Sport"
          defaultValue={searchParams.sport}
          options={sportOptions}
        />
        <MultiSelect
          name="state"
          label="State"
          defaultValue={searchParams.state}
          options={US_STATES.map((s) => ({ value: s.code, label: s.code }))}
        />
        <MultiSelect
          name="has_email"
          label="Has email"
          defaultValue={searchParams.has_email}
          options={[
            { value: "yes", label: "yes" },
            { value: "no", label: "no" },
          ]}
        />
        <MultiSelect
          name="review"
          label="Needs review"
          defaultValue={searchParams.review}
          options={[{ value: "yes", label: "needs review" }]}
        />
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Link
          href="/people"
          className="text-sm text-muted-foreground hover:underline"
        >
          Clear
        </Link>
      </form>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Sport</th>
              <th className="px-4 py-2">Gender</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">School</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Verified</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-muted-foreground"
                  colSpan={7}
                >
                  No people match these filters.
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                // Smart role: coach_role label for coaches, full title for
                // everyone else (Athletic Director, Athletic Trainer, etc.).
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
                      {teamGenderLabel(p.teamGender, p.schoolLevel) ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {roleLabel}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.schoolId ? (
                        <Link
                          href={`/schools/${p.schoolId}`}
                          className="hover:underline"
                        >
                          {p.schoolName}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {p.state ? (
                        <span className="ml-1 text-xs">· {p.state}</span>
                      ) : null}
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
      </div>

      <Pager
        basePath="/people"
        searchParams={searchParams}
        page={page}
        totalPages={totalPages}
      />
    </div>
  );
}

