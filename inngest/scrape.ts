import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { people, schools, scrapeJobs } from "@/lib/db/schema";
import { braveSearch, pickBestSchoolUrl } from "@/lib/scraping/brave";
import { mapSite, scrapePage } from "@/lib/scraping/firecrawl";
import { extractPeople, pickDirectoryUrls } from "@/lib/scraping/extract";
import { normalizeSocialProfiles } from "@/lib/social";
import { canonicalizeSport } from "@/lib/sports";
import { canonicalizeDivision } from "@/lib/conferences";

/** Parallel map with a concurrency cap. Preserves input order. */
async function pmap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const EventData = z.object({
  schoolId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const scrapeSchool = inngest.createFunction(
  {
    id: "scrape-school",
    name: "Scrape: school → people",
    retries: 2,
    // Global cap, plus per-school cap so we don't hit one domain in parallel.
    concurrency: [
      { limit: 5 },
      { limit: 1, key: "event.data.schoolId" },
    ],
  },
  { event: "scrape/school" },
  async ({ event, step, logger }) => {
    const { schoolId, jobId } = EventData.parse(event.data);

    const school = await step.run("load-school", async () => {
      const [row] = await db
        .select()
        .from(schools)
        .where(eq(schools.id, schoolId))
        .limit(1);
      if (!row) throw new Error(`School ${schoolId} not found`);
      return row;
    });

    await step.run("mark-running", async () => {
      await db
        .update(scrapeJobs)
        .set({ status: "running", stage: "find_website", startedAt: new Date() })
        .where(eq(scrapeJobs.id, jobId));
      await db
        .update(schools)
        .set({ scrapeStatus: "running" })
        .where(eq(schools.id, schoolId));
    });

    try {
      // ----------------------------------------------------------------
      // Step 1 — find_website
      // ----------------------------------------------------------------
      const websiteUrl =
        school.websiteUrl ??
        (await step.run("find-website", async () => {
          const q = `${school.name} ${school.city ?? ""} ${school.state} school`.trim();
          const results = await braveSearch(q, 10);
          const picked = pickBestSchoolUrl(results);
          if (!picked) {
            throw new Error(`No plausible school URL found for "${q}"`);
          }
          await db
            .update(schools)
            .set({ websiteUrl: picked })
            .where(eq(schools.id, schoolId));
          return picked;
        }));

      // ----------------------------------------------------------------
      // Step 2 — find_directory
      // ----------------------------------------------------------------
      const directory = await step.run("find-directory", async () => {
        await db
          .update(scrapeJobs)
          .set({ stage: "find_directory" })
          .where(eq(scrapeJobs.id, jobId));
        const homepage = await scrapePage(websiteUrl);
        const hints = await pickDirectoryUrls(websiteUrl, homepage.markdown);
        await db
          .update(schools)
          .set({
            staffDirectoryUrl:
              hints.staff_directory_url ?? school.staffDirectoryUrl,
            athleticsUrl: hints.athletics_url ?? school.athleticsUrl,
            conference:
              hints.school_meta.conference ?? school.conference,
            division:
              canonicalizeDivision(hints.school_meta.division) ??
              school.division,
            adminEmail:
              hints.school_meta.admin_email ?? school.adminEmail,
            adminPhone:
              hints.school_meta.admin_phone ?? school.adminPhone,
            athleticsEmail:
              hints.school_meta.athletics_email ?? school.athleticsEmail,
            athleticsPhone:
              hints.school_meta.athletics_phone ?? school.athleticsPhone,
            boosterEmail:
              hints.school_meta.booster_email ?? school.boosterEmail,
            boosterPhone:
              hints.school_meta.booster_phone ?? school.boosterPhone,
            boosterUrl: hints.school_meta.booster_url ?? school.boosterUrl,
          })
          .where(eq(schools.id, schoolId));
        return hints;
      });

      const seedDirectoryRoots = [
        directory.athletics_url,
        directory.staff_directory_url,
      ].filter((u): u is string => Boolean(u));

      // ----------------------------------------------------------------
      // Step 2.5 — discover coach/staff sub-pages.
      //
      // Most college athletic sites (Sidearm Sports etc.) put coach contacts
      // on per-sport pages like /sports/<slug>/coaches. Firecrawl /map's
      // search filter ("coach") surfaces some of these but misses sports
      // whose names don't contain the search term in their URLs. So we
      // also harvest every /sports/<slug>/ path the map returns and
      // synthesize a /coaches URL for each — covering every sport on the
      // site, not just the ones that happened to surface.
      // ----------------------------------------------------------------
      const LIST_PATH_RE =
        /\/(coach(es|ing)?(-staff)?|staff(-directory)?|our-coaches|coaching-staff|directory|leadership|administration|athletic-staff|athletics?-staff)\/?(\?.*)?$/i;
      const SPORT_SLUG_RE = /\/sports\/([a-z0-9][a-z0-9-]+)(?:\/|$)/i;
      const MAX_DISCOVERED_PAGES = 30;

      function sameHost(a: string, b: string): boolean {
        try {
          return new URL(a).hostname === new URL(b).hostname;
        } catch {
          return false;
        }
      }

      const discoveredUrls = await step.run("discover-coach-pages", async () => {
        if (seedDirectoryRoots.length === 0) return [] as string[];
        const seen = new Set<string>(seedDirectoryRoots);
        const out: string[] = [];

        for (const root of seedDirectoryRoots) {
          const allLinks = new Set<string>();
          for (const search of ["coach", "staff"]) {
            try {
              const links = await mapSite(root, { search, limit: 500 });
              for (const link of links) {
                if (!sameHost(link, root)) continue;
                allLinks.add(link);
              }
            } catch (err) {
              logger.warn("map failed; continuing", {
                url: root,
                search,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          // (a) explicit list pages that match LIST_PATH_RE
          for (const link of allLinks) {
            if (seen.has(link)) continue;
            if (LIST_PATH_RE.test(link)) {
              seen.add(link);
              out.push(link);
              if (out.length >= MAX_DISCOVERED_PAGES) break;
            }
          }
          if (out.length >= MAX_DISCOVERED_PAGES) break;

          // (b) synthesize /sports/<slug>/coaches for every sport seen in
          // the map results. Catches sports whose URLs don't contain
          // "coach" or "staff" in the search filter.
          const rootBase = new URL(root);
          const slugs = new Set<string>();
          for (const link of allLinks) {
            const m = link.match(SPORT_SLUG_RE);
            if (!m) continue;
            const slug = m[1].toLowerCase();
            // Filter slugs that aren't real sports: year-like (news article
            // paths like /sports/2025/...) and short numeric.
            if (/^\d{4}$/.test(slug)) continue;
            if (/^\d+$/.test(slug)) continue;
            slugs.add(slug);
          }
          for (const slug of slugs) {
            const synth = `${rootBase.origin}/sports/${slug}/coaches`;
            if (seen.has(synth)) continue;
            seen.add(synth);
            out.push(synth);
            if (out.length >= MAX_DISCOVERED_PAGES) break;
          }
          if (out.length >= MAX_DISCOVERED_PAGES) break;
        }
        return out.slice(0, MAX_DISCOVERED_PAGES);
      });

      const directoryRoots = [...seedDirectoryRoots, ...discoveredUrls];

      logger.info("scrape urls assembled", {
        schoolId,
        seedCount: seedDirectoryRoots.length,
        discoveredCount: discoveredUrls.length,
        urls: directoryRoots,
      });

      if (directoryRoots.length === 0) {
        // No directory found — finalize as success with 0 people.
        await step.run("finalize-no-directory", async () => {
          await db
            .update(scrapeJobs)
            .set({
              status: "success",
              stage: "done",
              pagesFetched: 1,
              peopleFound: 0,
              completedAt: new Date(),
            })
            .where(eq(scrapeJobs.id, jobId));
          await db
            .update(schools)
            .set({ scrapeStatus: "success", lastScrapedAt: new Date() })
            .where(eq(schools.id, schoolId));
        });
        return { ok: true as const, peopleFound: 0, note: "no-directory" };
      }

      // ----------------------------------------------------------------
      // Steps 3 + 4 — fetch + extract each directory URL in parallel.
      // Each URL is its own step.run so the Inngest UI shows per-page
      // progress and a single page failure doesn't retry the others.
      // We bound concurrency with `pmap` to avoid Firecrawl / Anthropic
      // rate limits.
      // ----------------------------------------------------------------
      await step.run("mark-extract", async () => {
        await db
          .update(scrapeJobs)
          .set({ stage: "extract", pagesFetched: directoryRoots.length })
          .where(eq(scrapeJobs.id, jobId));
      });

      type ExtractedPerson = Awaited<
        ReturnType<typeof extractPeople>
      >[number] & { bio_url?: string | null };

      async function processOne(
        url: string,
        prefix: string,
      ): Promise<ExtractedPerson[]> {
        return step.run(`${prefix}:${url}`, async () => {
          try {
            const page = await scrapePage(url);
            if (!page.markdown.trim()) {
              logger.info(`${prefix} scrape returned empty markdown`, { url });
              return [];
            }
            const found = await extractPeople(page.url, page.markdown);
            logger.info(`${prefix} extracted`, {
              url,
              markdownLength: page.markdown.length,
              peopleCount: found.length,
              sports: Array.from(
                new Set(found.map((p) => p.sport).filter(Boolean)),
              ),
            });
            return found.map((p) => ({
              ...p,
              bio_url: p.bio_url ?? page.url,
            }));
          } catch (err) {
            logger.warn(`${prefix} failed; continuing`, {
              url,
              error: err instanceof Error ? err.message : String(err),
            });
            return [];
          }
        });
      }

      const initialExtracted: ExtractedPerson[] = (
        await pmap(directoryRoots, 3, (url) => processOne(url, "page"))
      ).flat();

      // ----------------------------------------------------------------
      // Bio enrichment — for each unique bio_url Claude returned, scrape
      // the page and extract again (richer per-person info, socials).
      // Capped at 10 to bound cost.
      // ----------------------------------------------------------------
      const directoryUrls = new Set(directoryRoots);
      const bioUrls = Array.from(
        new Set(
          initialExtracted
            .map((p) => p.bio_url)
            .filter((u): u is string => Boolean(u) && !directoryUrls.has(u!)),
        ),
      ).slice(0, 10);

      const bioExtracted: ExtractedPerson[] = (
        await pmap(bioUrls, 3, (url) => processOne(url, "bio"))
      ).flat();

      const extracted = [...initialExtracted, ...bioExtracted];

      // Update pagesFetched to reflect everything we attempted.
      await step.run("count-pages", async () => {
        await db
          .update(scrapeJobs)
          .set({ pagesFetched: directoryRoots.length + bioUrls.length })
          .where(eq(scrapeJobs.id, jobId));
      });

      // ----------------------------------------------------------------
      // Persist people (upsert keyed on (school_id, full_name, title))
      // ----------------------------------------------------------------
      const inserted = await step.run("upsert-people", async () => {
        if (extracted.length === 0) return 0;

        // Dedupe within this batch on the same key the unique index uses.
        // Same coach often appears on multiple list pages (e.g. head football
        // coach is on /sports/football/coaches AND /staff-directory). Postgres
        // ON CONFLICT can't update the same target row twice in one batch, so
        // we collapse duplicates here. Higher-confidence wins; ties keep the
        // row with more populated fields (email > no email, etc.).
        type Row = {
          schoolId: string;
          fullName: string;
          firstName: string | null;
          lastName: string | null;
          title: string | null;
          roleCategory: "coach" | "leader" | "staff";
          coachRole: string | null;
          teamGender: "mens" | "womens" | "coed" | null;
          sport: string | null;
          email: string | null;
          phone: string | null;
          bioUrl: string | null;
          photoUrl: string | null;
          socialProfiles: ReturnType<typeof normalizeSocialProfiles>;
          confidenceScore: string;
        };

        function richness(r: Row): number {
          let s = 0;
          if (r.email) s += 4;
          if (r.phone) s += 1;
          if (r.socialProfiles) s += 2;
          if (r.bioUrl) s += 1;
          if (r.photoUrl) s += 1;
          if (r.coachRole) s += 1;
          if (r.teamGender) s += 1;
          if (r.sport) s += 1;
          return s;
        }

        const dedupedMap = new Map<string, Row>();
        for (const p of extracted) {
          const row: Row = {
            schoolId,
            fullName: p.full_name,
            firstName: p.first_name ?? null,
            lastName: p.last_name ?? null,
            title: p.title ?? null,
            roleCategory: p.role_category,
            coachRole: p.coach_role ?? null,
            teamGender: p.team_gender ?? null,
            sport: canonicalizeSport(p.sport),
            email: p.email ?? null,
            phone: p.phone ?? null,
            bioUrl: p.bio_url ?? null,
            photoUrl: p.photo_url ?? null,
            socialProfiles: normalizeSocialProfiles(p.social_profiles ?? null),
            confidenceScore: p.confidence.toFixed(2),
          };
          // Match the (school_id, full_name, title) unique index exactly.
          // Note: Postgres treats NULL as distinct in unique indexes, so two
          // null-title rows for same name will both insert (intended for now).
          const key = `${row.schoolId}::${row.fullName.toLowerCase()}::${(row.title ?? "").toLowerCase()}`;
          const existing = dedupedMap.get(key);
          if (!existing) {
            dedupedMap.set(key, row);
            continue;
          }
          const existingConf = Number(existing.confidenceScore);
          const newConf = Number(row.confidenceScore);
          if (
            newConf > existingConf ||
            (newConf === existingConf && richness(row) > richness(existing))
          ) {
            dedupedMap.set(key, row);
          }
        }
        const rows = Array.from(dedupedMap.values());

        const result = await db
          .insert(people)
          .values(rows)
          .onConflictDoUpdate({
            target: [people.schoolId, people.fullName, people.title],
            set: {
              firstName: sql`excluded.first_name`,
              lastName: sql`excluded.last_name`,
              roleCategory: sql`excluded.role_category`,
              coachRole: sql`excluded.coach_role`,
              teamGender: sql`excluded.team_gender`,
              sport: sql`excluded.sport`,
              email: sql`excluded.email`,
              phone: sql`excluded.phone`,
              bioUrl: sql`excluded.bio_url`,
              photoUrl: sql`excluded.photo_url`,
              socialProfiles: sql`excluded.social_profiles`,
              confidenceScore: sql`excluded.confidence_score`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: people.id });
        return result.length;
      });

      // ----------------------------------------------------------------
      // Step 5 — finalize
      // ----------------------------------------------------------------
      await step.run("finalize", async () => {
        await db
          .update(scrapeJobs)
          .set({
            status: "success",
            stage: "done",
            peopleFound: inserted,
            completedAt: new Date(),
          })
          .where(eq(scrapeJobs.id, jobId));
        await db
          .update(schools)
          .set({ scrapeStatus: "success", lastScrapedAt: new Date() })
          .where(eq(schools.id, schoolId));
      });

      // Auto-enrich emails for any people we just inserted that lack one.
      // Fired as a separate Inngest event so we don't block scrape completion.
      if (inserted > 0) {
        await step.run("trigger-email-enrich", async () => {
          await inngest.send({
            name: "email/enrich",
            data: { schoolId },
          });
        });
      }

      return {
        ok: true as const,
        peopleFound: inserted,
        pagesScraped: directoryRoots.length + bioUrls.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("scrape failed", { schoolId, jobId, message });
      await db
        .update(scrapeJobs)
        .set({
          status: "failed",
          errorMessage: message,
          completedAt: new Date(),
        })
        .where(eq(scrapeJobs.id, jobId));
      await db
        .update(schools)
        .set({ scrapeStatus: "failed" })
        .where(eq(schools.id, schoolId));
      throw err;
    }
  },
);
