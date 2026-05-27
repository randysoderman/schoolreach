import { eq } from "drizzle-orm";
import { z } from "zod";
import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { discoveryJobs, schools, type SchoolLevel } from "@/lib/db/schema";
import { fetchHigherEd, fetchK12Schools } from "@/lib/discovery/urban";
import { fipsForCode } from "@/lib/states";

const K12_LEVELS = new Set<SchoolLevel>([
  "elementary",
  "middle",
  "high",
  "k12_combined",
]);

const Levels = z.array(
  z.enum(["elementary", "middle", "high", "college", "k12_combined"]),
);

const EventData = z.object({
  jobId: z.string().uuid(),
  state: z.string().length(2),
  levels: Levels,
  dryRun: z.boolean().default(false),
});

export const discoveryRun = inngest.createFunction(
  {
    id: "discovery-run",
    name: "Discovery: state → schools",
    retries: 2,
  },
  { event: "discovery/run" },
  async ({ event, step, logger }) => {
    const { jobId, state, levels, dryRun } = EventData.parse(event.data);

    logger.info("discovery start", { jobId, state, levels, dryRun });

    await step.run("mark-running", async () => {
      await db
        .update(discoveryJobs)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(discoveryJobs.id, jobId));
    });

    try {
      const fips = fipsForCode(state);
      if (!fips) throw new Error(`Unknown state code: ${state}`);

      const k12Levels = levels.filter((l) => K12_LEVELS.has(l));
      const wantHigherEd = levels.includes("college");

      const k12 = await step.run("fetch-k12", async () => {
        if (k12Levels.length === 0) return [];
        return fetchK12Schools({ fips, k12Levels });
      });

      const higher = await step.run("fetch-higher", async () => {
        if (!wantHigherEd) return [];
        return fetchHigherEd({ fips });
      });

      const all = [...k12, ...higher];
      logger.info("discovery fetched", {
        jobId,
        k12: k12.length,
        higher: higher.length,
        total: all.length,
      });

      let upserted = 0;
      if (!dryRun && all.length > 0) {
        upserted = await step.run("upsert-schools", async () => {
          const rows = all.map((s) => ({
            ncesId: s.ncesId,
            name: s.name,
            level: s.level,
            state: s.state,
            city: s.city,
            district: s.district,
            streetAddress: s.streetAddress,
            zip: s.zip,
            websiteUrl: s.websiteUrl,
            enrollment: s.enrollment,
            source: s.source,
          }));

          // Insert ignoring duplicates so we don't clobber manual edits.
          // Step 7 will own re-scrape decisions per row.
          const result = await db
            .insert(schools)
            .values(rows)
            .onConflictDoNothing({ target: schools.ncesId })
            .returning({ id: schools.id });
          return result.length;
        });
      }

      await step.run("mark-success", async () => {
        await db
          .update(discoveryJobs)
          .set({
            status: "success",
            schoolsDiscovered: all.length,
            schoolsEnqueued: upserted,
            completedAt: new Date(),
          })
          .where(eq(discoveryJobs.id, jobId));
      });

      return {
        ok: true as const,
        discovered: all.length,
        upserted,
        dryRun,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("discovery failed", { jobId, message });
      await db
        .update(discoveryJobs)
        .set({
          status: "failed",
          errorMessage: message,
          completedAt: new Date(),
        })
        .where(eq(discoveryJobs.id, jobId));
      throw err;
    }
  },
);

