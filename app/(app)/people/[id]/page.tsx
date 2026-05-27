import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { people, schools } from "@/lib/db/schema";
import { COACH_ROLES, SPORTS, teamGenderOptions } from "@/lib/sports";
import { levelLabel } from "@/lib/levels";
import { isUuid } from "@/lib/utils";
import { PersonForm } from "./person-form";

export default async function PersonDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isUuid(params.id)) notFound();

  const [row] = await db
    .select({
      person: people,
      school: schools,
    })
    .from(people)
    .leftJoin(schools, eq(people.schoolId, schools.id))
    .where(eq(people.id, params.id))
    .limit(1);

  if (!row) notFound();

  const { person, school } = row;
  const teamGenderOpts = teamGenderOptions(school?.level);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/people"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All people
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {person.fullName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {school ? (
            <>
              <Link
                href={`/schools/${school.id}`}
                className="hover:underline"
              >
                {school.name}
              </Link>{" "}
              · {school.state} · {levelLabel(school.level)}
            </>
          ) : (
            "No school linked"
          )}
        </p>
      </div>

      <PersonForm
        id={person.id}
        initial={{
          fullName: person.fullName,
          firstName: person.firstName,
          lastName: person.lastName,
          title: person.title,
          roleCategory: person.roleCategory,
          coachRole: person.coachRole,
          teamGender: person.teamGender,
          sport: person.sport,
          email: person.email,
          phone: person.phone,
          bioUrl: person.bioUrl,
          photoUrl: person.photoUrl,
          emailStatus: person.emailStatus ?? "unknown",
          verified: person.verified ?? false,
          socialProfiles: person.socialProfiles ?? null,
        }}
        coachRoleOptions={[...COACH_ROLES]}
        teamGenderOptions={[...teamGenderOpts]}
        sportOptions={[...SPORTS]}
      />
    </div>
  );
}
