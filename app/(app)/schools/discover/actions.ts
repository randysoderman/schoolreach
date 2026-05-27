"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { discoveryJobs, type SchoolLevel } from "@/lib/db/schema";
import { US_STATES } from "@/lib/states";
import { LEVELS } from "@/lib/levels";
import { isUuid } from "@/lib/utils";
import { inngest } from "@/inngest/client";

const STATE_CODES = US_STATES.map((s) => s.code) as [string, ...string[]];
const STATE_CHOICES: [string, ...string[]] = ["ALL", ...STATE_CODES];
const LEVEL_VALUES = LEVELS as readonly SchoolLevel[];

const Input = z.object({
  state: z.enum(STATE_CHOICES),
  levels: z
    .array(z.enum(LEVEL_VALUES as [SchoolLevel, ...SchoolLevel[]]))
    .min(1, "Pick at least one level."),
  dryRun: z.boolean().default(false),
});

export async function startDiscovery(formData: FormData): Promise<void> {
  const parsed = Input.safeParse({
    state: formData.get("state"),
    levels: formData.getAll("levels"),
    dryRun: formData.get("dryRun") === "on",
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    redirect(`/schools/discover?error=${encodeURIComponent(message)}`);
  }

  const { state, levels, dryRun } = parsed.data;

  // "ALL" fans out one discovery job per state. Force dry-run when ALL is
  // selected without an explicit opt-in, so users don't accidentally pull
  // ~130k schools across all 50 states.
  if (state === "ALL") {
    const effectiveDryRun = dryRun || formData.get("confirmAll") !== "on";
    const jobs = await db
      .insert(discoveryJobs)
      .values(
        US_STATES.map((s) => ({
          state: s.code,
          levels,
          status: "queued",
          dryRun: effectiveDryRun,
        })),
      )
      .returning({ id: discoveryJobs.id, state: discoveryJobs.state });

    // Send events with a small stagger so we don't blow Urban API rate
    // limits. Inngest will execute them concurrently respecting the
    // function's own concurrency settings.
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      await inngest.send({
        name: "discovery/run",
        data: {
          jobId: j.id,
          state: j.state,
          levels,
          dryRun: effectiveDryRun,
        },
      });
    }
    revalidatePath("/schools/discover");
    redirect(
      `/schools/discover?all=1${effectiveDryRun ? "&forcedDryRun=1" : ""}`,
    );
  }

  const [job] = await db
    .insert(discoveryJobs)
    .values({
      state,
      levels,
      status: "queued",
      dryRun,
    })
    .returning({ id: discoveryJobs.id });

  await inngest.send({
    name: "discovery/run",
    data: {
      jobId: job.id,
      state,
      levels,
      dryRun,
    },
  });

  revalidatePath("/schools/discover");
  redirect(`/schools/discover?job=${job.id}`);
}

export async function cancelDiscoveryJob(jobId: string): Promise<void> {
  if (!isUuid(jobId)) {
    redirect("/schools/discover?error=Invalid+job+id");
  }
  await db
    .update(discoveryJobs)
    .set({
      status: "failed",
      errorMessage: "Manually cancelled by user",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(discoveryJobs.id, jobId),
        inArray(discoveryJobs.status, ["queued", "running"]),
      ),
    );
  revalidatePath("/schools/discover");
  redirect(`/schools/discover?job=${jobId}`);
}
