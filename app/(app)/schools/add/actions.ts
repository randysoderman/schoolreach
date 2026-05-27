"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { schools, type SchoolLevel } from "@/lib/db/schema";
import { US_STATES } from "@/lib/states";
import { LEVELS } from "@/lib/levels";
import { braveSearch, pickBestSchoolUrl } from "@/lib/scraping/brave";

const STATE_CODES = US_STATES.map((s) => s.code) as [string, ...string[]];
const LEVEL_VALUES = LEVELS as readonly SchoolLevel[];

const opt = (s: z.ZodString) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), s.nullable());

const Input = z.object({
  name: z.string().min(2, "Name is required."),
  state: z.enum(STATE_CODES),
  level: z.enum(LEVEL_VALUES as [SchoolLevel, ...SchoolLevel[]]),
  city: opt(z.string()),
  district: opt(z.string()),
  websiteUrl: opt(z.string().url("Website must be a valid URL.")),
});

export async function createManualSchool(formData: FormData): Promise<void> {
  const parsed = Input.safeParse({
    name: formData.get("name"),
    state: formData.get("state"),
    level: formData.get("level"),
    city: formData.get("city"),
    district: formData.get("district"),
    websiteUrl: formData.get("websiteUrl"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    redirect(`/schools/add?error=${encodeURIComponent(message)}`);
  }

  const { name, state, level, city, district, websiteUrl } = parsed.data;

  // Manual rows get a unique synthetic nces_id so the unique index doesn't
  // collide. Format: 'manual:<timestamp>:<rand>'.
  const ncesId = `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  const [created] = await db
    .insert(schools)
    .values({
      ncesId,
      name,
      state,
      level,
      city,
      district,
      websiteUrl,
      source: "manual",
    })
    .returning({ id: schools.id });

  revalidatePath("/schools");
  redirect(`/schools/${created.id}`);
}

export type BraveSearchHit = {
  title: string;
  url: string;
  description?: string;
};

export type FindWebsiteResult =
  | { ok: true; best: string | null; results: BraveSearchHit[] }
  | { ok: false; error: string };

export async function findWebsite(
  query: string,
): Promise<FindWebsiteResult> {
  if (!query.trim()) {
    return { ok: false, error: "Enter a school name + city/state to search." };
  }
  try {
    const results = await braveSearch(query, 5);
    return {
      ok: true,
      best: pickBestSchoolUrl(results),
      results,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
