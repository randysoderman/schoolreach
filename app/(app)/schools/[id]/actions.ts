"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { schools, scrapeJobs, people } from "@/lib/db/schema";
import { isUuid } from "@/lib/utils";
import { inngest } from "@/inngest/client";

// Skip re-scraping the same school more often than this unless force=true.
// Override via the Force checkbox on /schools/[id] (e.g. when a coach
// changes schools and we want to refresh the roster immediately).
const SCRAPE_FRESHNESS_DAYS = 30;

export type RescrapeResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

export async function startScrape(
  schoolId: string,
  force = false,
): Promise<RescrapeResult> {
  if (!isUuid(schoolId)) return { ok: false, error: "Invalid school id." };

  const [school] = await db
    .select({
      id: schools.id,
      lastScrapedAt: schools.lastScrapedAt,
      scrapeStatus: schools.scrapeStatus,
    })
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1);
  if (!school) return { ok: false, error: "School not found." };

  if (school.scrapeStatus === "running") {
    return { ok: false, error: "A scrape is already running for this school." };
  }

  if (!force && school.lastScrapedAt) {
    const ageMs = Date.now() - new Date(school.lastScrapedAt).getTime();
    const ageDays = ageMs / 86400000;
    if (ageDays < SCRAPE_FRESHNESS_DAYS) {
      const remaining = Math.ceil(SCRAPE_FRESHNESS_DAYS - ageDays);
      return {
        ok: false,
        error: `Scraped ${Math.floor(ageDays)} day(s) ago. Wait ${remaining} more day(s) or check Force re-scrape to override.`,
      };
    }
  }

  const [job] = await db
    .insert(scrapeJobs)
    .values({
      schoolId,
      status: "queued",
      stage: "find_website",
    })
    .returning({ id: scrapeJobs.id });

  await db
    .update(schools)
    .set({ scrapeStatus: "pending" })
    .where(eq(schools.id, schoolId));

  await inngest.send({
    name: "scrape/school",
    data: { schoolId, jobId: job.id },
  });

  revalidatePath(`/schools/${schoolId}`);
  return { ok: true, jobId: job.id };
}

export type CancelResult =
  | { ok: true; cancelled: number }
  | { ok: false; error: string };

export async function cancelScrape(schoolId: string): Promise<CancelResult> {
  if (!isUuid(schoolId)) return { ok: false, error: "Invalid school id." };

  const cancelled = await db
    .update(scrapeJobs)
    .set({
      status: "failed",
      errorMessage: "Manually cancelled by user",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(scrapeJobs.schoolId, schoolId),
        // Cancel queued or running rows only.
        eq(scrapeJobs.status, "running"),
      ),
    )
    .returning({ id: scrapeJobs.id });

  await db
    .update(schools)
    .set({ scrapeStatus: "failed" })
    .where(and(eq(schools.id, schoolId), eq(schools.scrapeStatus, "running")));

  revalidatePath(`/schools/${schoolId}`);
  return { ok: true, cancelled: cancelled.length };
}

export type EnrichResult =
  | { ok: true; missing: number }
  | { ok: false; error: string };

export async function startEmailEnrich(
  schoolId: string,
): Promise<EnrichResult> {
  if (!isUuid(schoolId)) return { ok: false, error: "Invalid school id." };

  const [school] = await db
    .select({ id: schools.id, websiteUrl: schools.websiteUrl })
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1);
  if (!school) return { ok: false, error: "School not found." };

  if (!school.websiteUrl) {
    return {
      ok: false,
      error: "School has no website URL — can't guess email domain.",
    };
  }

  const missingRows = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.schoolId, schoolId), isNull(people.email)));

  if (missingRows.length === 0) {
    return { ok: false, error: "Nobody is missing an email." };
  }

  await inngest.send({
    name: "email/enrich",
    data: { schoolId },
  });

  revalidatePath(`/schools/${schoolId}`);
  return { ok: true, missing: missingRows.length };
}
