import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { people, schools } from "@/lib/db/schema";
import {
  DOMAIN_PATTERN_OVERRIDES,
  emailDomainCandidates,
  generateCandidates,
} from "@/lib/email/patterns";
import { hasMx } from "@/lib/email/mx";

const EventData = z.object({
  schoolId: z.string().uuid(),
});

export const emailEnrich = inngest.createFunction(
  {
    id: "email-enrich",
    name: "Email: pattern-guess + MX validate",
    retries: 1,
    concurrency: [{ limit: 1, key: "event.data.schoolId" }],
  },
  { event: "email/enrich" },
  async ({ event, step, logger }) => {
    const { schoolId } = EventData.parse(event.data);

    const school = await step.run("load-school", async () => {
      const [row] = await db
        .select({
          id: schools.id,
          name: schools.name,
          websiteUrl: schools.websiteUrl,
        })
        .from(schools)
        .where(eq(schools.id, schoolId))
        .limit(1);
      if (!row) throw new Error(`School ${schoolId} not found`);
      return row;
    });

    const validDomains = await step.run("resolve-domains", async () => {
      const candidates = emailDomainCandidates(school.websiteUrl);
      const ok: string[] = [];
      for (const d of candidates) {
        if (await hasMx(d)) ok.push(d);
      }
      return ok;
    });

    if (validDomains.length === 0) {
      logger.warn("no MX-valid domain for school", {
        schoolId,
        websiteUrl: school.websiteUrl,
      });
      return {
        ok: true as const,
        enriched: 0,
        reason: "no_mx_domain",
      };
    }

    const targets = await step.run("load-missing-emails", async () => {
      return db
        .select({
          id: people.id,
          fullName: people.fullName,
          firstName: people.firstName,
          lastName: people.lastName,
        })
        .from(people)
        .where(and(eq(people.schoolId, schoolId), isNull(people.email)));
    });

    if (targets.length === 0) {
      return { ok: true as const, enriched: 0, reason: "no_targets" };
    }

    const enriched = await step.run("guess-and-save", async () => {
      let count = 0;
      // Prefer a domain we have a verified pattern override for, over a
      // generic MX-valid one. e.g. for Pitt athletics, athletics.pitt.edu
      // beats pitt.edu because we know the exact pattern.
      const primaryDomain =
        validDomains.find((d) => DOMAIN_PATTERN_OVERRIDES[d]) ??
        validDomains[0];
      for (const person of targets) {
        const candidates = generateCandidates(person, primaryDomain);
        if (candidates.length === 0) continue;
        // Take the top-ranked pattern's email — mark as guessed/unknown.
        const guess = candidates[0];
        await db
          .update(people)
          .set({
            email: guess,
            emailStatus: "unknown",
            verified: false,
          })
          .where(eq(people.id, person.id));
        count++;
      }
      return count;
    });

    return {
      ok: true as const,
      enriched,
      domain: validDomains[0],
      totalDomainsConsidered: validDomains.length,
    };
  },
);
