"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { schools, scrapeJobs } from "@/lib/db/schema";
import { isUuid } from "@/lib/utils";
import { inngest } from "@/inngest/client";

const SCRAPE_FRESHNESS_DAYS = 30;

const Input = z.object({
  schoolIds: z.array(z.string().uuid()).min(1).max(200),
  force: z.boolean().default(false),
});

export type BulkScrapeResult = {
  ok: true;
  queued: number;
  skipped: number;
  notFound: number;
};

/**
 * Queue scrape jobs for a list of schools at once. Reuses the same
 * freshness guard as single-school startScrape: skips schools scraped
 * within SCRAPE_FRESHNESS_DAYS unless force=true. Already-running schools
 * are also skipped to avoid double-firing.
 */
export async function bulkScrape(
  schoolIds: string[],
  force: boolean,
): Promise<BulkScrapeResult> {
  const parsed = Input.parse({ schoolIds, force });

  let queued = 0;
  let skipped = 0;
  let notFound = 0;

  for (const id of parsed.schoolIds) {
    if (!isUuid(id)) {
      notFound++;
      continue;
    }
    const [school] = await db
      .select({
        id: schools.id,
        lastScrapedAt: schools.lastScrapedAt,
        scrapeStatus: schools.scrapeStatus,
      })
      .from(schools)
      .where(eq(schools.id, id))
      .limit(1);
    if (!school) {
      notFound++;
      continue;
    }
    if (school.scrapeStatus === "running") {
      skipped++;
      continue;
    }
    if (!parsed.force && school.lastScrapedAt) {
      const ageDays =
        (Date.now() - new Date(school.lastScrapedAt).getTime()) / 86400000;
      if (ageDays < SCRAPE_FRESHNESS_DAYS) {
        skipped++;
        continue;
      }
    }

    const [job] = await db
      .insert(scrapeJobs)
      .values({
        schoolId: id,
        status: "queued",
        stage: "find_website",
      })
      .returning({ id: scrapeJobs.id });

    await db
      .update(schools)
      .set({ scrapeStatus: "pending" })
      .where(eq(schools.id, id));

    await inngest.send({
      name: "scrape/school",
      data: { schoolId: id, jobId: job.id },
    });
    queued++;
  }

  revalidatePath("/schools");
  return { ok: true, queued, skipped, notFound };
}
