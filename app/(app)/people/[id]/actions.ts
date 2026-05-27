"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { people } from "@/lib/db/schema";
import { isUuid } from "@/lib/utils";
import { SOCIAL_PLATFORMS, normalizeSocialProfiles } from "@/lib/social";

const ROLE = z.enum(["coach", "leader", "staff"]);
const EMAIL_STATUS = z.enum(["unknown", "valid", "invalid", "risky"]);

const optional = (s: z.ZodString) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), s.nullable());

const PersonInput = z.object({
  fullName: z.string().min(1, "Name is required"),
  firstName: optional(z.string()),
  lastName: optional(z.string()),
  title: optional(z.string()),
  roleCategory: ROLE,
  coachRole: optional(z.string()),
  teamGender: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.enum(["mens", "womens", "coed"]).nullable(),
  ),
  sport: optional(z.string()),
  email: optional(z.string().email("Email looks malformed")),
  phone: optional(z.string()),
  bioUrl: optional(z.string().url("Bio URL must be a URL")),
  photoUrl: optional(z.string().url("Photo URL must be a URL")),
  emailStatus: EMAIL_STATUS,
});

export type UpdatePersonResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updatePerson(
  id: string,
  formData: FormData,
): Promise<UpdatePersonResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid id." };

  const parsed = PersonInput.safeParse({
    fullName: formData.get("fullName"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    title: formData.get("title"),
    roleCategory: formData.get("roleCategory"),
    coachRole: formData.get("coachRole"),
    teamGender: formData.get("teamGender"),
    sport: formData.get("sport"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    bioUrl: formData.get("bioUrl"),
    photoUrl: formData.get("photoUrl"),
    emailStatus: formData.get("emailStatus"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const socialRaw: Record<string, string> = {};
  for (const { key } of SOCIAL_PLATFORMS) {
    const v = formData.get(`social_${key}`);
    if (typeof v === "string") socialRaw[key] = v;
  }
  const socialProfiles = normalizeSocialProfiles(socialRaw);

  await db
    .update(people)
    .set({ ...parsed.data, socialProfiles })
    .where(eq(people.id, id));
  revalidatePath(`/people/${id}`);
  revalidatePath("/people");
  return { ok: true };
}

export async function setVerified(
  id: string,
  verified: boolean,
): Promise<UpdatePersonResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid id." };
  await db.update(people).set({ verified }).where(eq(people.id, id));
  revalidatePath(`/people/${id}`);
  revalidatePath("/people");
  return { ok: true };
}
