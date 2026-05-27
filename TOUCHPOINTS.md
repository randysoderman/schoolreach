# TOUCHPOINTS.md — Helper → Downstream Map

A reverse-import index for the SchoolReach codebase. If you change a helper here,
this is the list of files that will feel it. Update when you add/remove a
load-bearing edge.

For the full architecture, read `CLAUDE.md` + `SPEC.md`. For the file tree, see
`CLAUDE.md > File layout`.

---

## Database layer

### `lib/db/schema.ts` — Drizzle tables + canonical types

The whole app imports from here. Changing a column means a migration first.

- **Tables exported**: `schools`, `people`, `scrapeJobs`, `discoveryJobs`,
  `campaigns`, `campaignRecipients`, `segments`, `suppressions`, `extractCache`
- **Types exported**: `SchoolLevel`, `RoleCategory`, `CoachRole`, `TeamGender`,
  `ScrapeStatus`, `EmailStatus`, `ScrapeJobStatus`, `ScrapeJobStage`,
  `CampaignStatus`, `RecipientStatus`, `SuppressionReason`, `SchoolSource`
- **Consumed by**:
  - Every `app/(app)/**/page.tsx` and `**/actions.ts` (read/write)
  - Every `inngest/*.ts` job
  - `scripts/seed.mjs` (via raw SQL, but column names must match)

### `lib/db/client.ts` — Drizzle Postgres client (`db`)

Singleton. Imported by every file that touches the DB. Pooled connection on
`DATABASE_URL`. Don't create a second client.

---

## Domain constants & canonicalization

### `lib/states.ts` — `US_STATES` (50 + DC, with FIPS)

- Imported by: `app/(app)/schools/page.tsx`, `schools/discover/page.tsx`,
  `people/page.tsx`, `schools/add/add-form.tsx`, `inngest/discovery.ts`
- Adding a state: update `US_STATES`. FIPS used by Urban Institute API.

### `lib/levels.ts` — `LEVELS`, `LEVEL_LABELS`, `levelLabel()`, `isCollegeLike()`

- `isCollegeLike()` is downstream of `lib/sports.ts:teamGenderOptions()`
  (drives "Mens/Womens" vs "Boys/Girls" labels)
- Imported by: schools list/detail/discover/add pages, people pages,
  `lib/sports.ts`
- Edit caution: `SchoolLevel` type lives in `schema.ts`; these must stay in sync

### `lib/sports.ts` — `SPORTS`, `COACH_ROLES`, `canonicalizeSport()`, `teamGenderOptions/Label`

- `canonicalizeSport()` called from `inngest/scrape.ts` during upsert. If you
  add aliases, scrape output normalizes immediately.
- `SPORTS` drives the dropdown on `/people` filters and `/people/[id]` edit form.
- `COACH_ROLES` drives the "Coach role" filter on `/people` and edit-form select.

### `lib/conferences.ts` — `DIVISIONS`, `CONFERENCES`, `canonicalizeDivision()`

- `canonicalizeDivision()` called from `inngest/scrape.ts` after Claude extracts
  the division string from a homepage. Edit aliases here, not in the prompt.
- `DIVISIONS` + `CONFERENCES` drive the filter dropdowns on `/schools`.
- Adding a new conference: append to `CONFERENCES`. No migration needed —
  column is freeform text.

### `lib/social.ts` — `SOCIAL_PLATFORMS`, `normalizeSocialProfiles()`

- Canonical platform keys (`linkedin`, `twitter`, etc.) for `people.social_profiles jsonb`
- `normalizeSocialProfiles()` runs in `inngest/scrape.ts` before persisting
- Used by `/people/[id]/person-form.tsx` to render per-platform URL inputs
- **JSONB schema**: defined here as `SocialProfiles`, referenced in `schema.ts`
  via `import("@/lib/social").SocialProfiles` — keep in sync

### `lib/pagination.ts` — `PAGE_SIZE`, `parsePageParam()`, `buildPageHref()`

- Used by every list page: `/schools`, `/people`
- `<Pager>` component takes `basePath + searchParams + page + totalPages` and
  uses these to compute prev/next links

---

## Scraping pipeline (downstream of `inngest/scrape.ts`)

The scrape function is the biggest dependency consumer in the codebase. Touching
any of these modules can change scrape behavior.

### `lib/scraping/brave.ts` — `braveSearch()`, `pickBestSchoolUrl()`

- Used by `inngest/scrape.ts` Step 1 (find_website) when school has no URL
- Also used by `app/(app)/schools/add/actions.ts` "Find website" helper
- Quota: 2000 queries/month free tier

### `lib/scraping/firecrawl.ts` — `scrapePage()`, `crawlSite()`, `mapSite()`

- `scrapePage()`: every directory page hit in scrape pipeline
- `mapSite()`: Step 2.5 (discover-coach-pages). Called twice with
  `search="coach"` and `search="staff"` per root.
- Quota: paid plan; rate limit is the bottleneck on bulk scrape

### `lib/scraping/extract.ts` — `pickDirectoryUrls()`, `extractPeople()`

- `pickDirectoryUrls()`: one Sonnet call per school (Step 2 in scrape.ts).
  Returns staff_directory_url, athletics_url, **and** school_meta (conference,
  division, admin/athletics/booster contacts).
- `extractPeople()`: many calls per school via `pmap` (Step 4 in scrape.ts).
  Routes through `llm.ts` adapter; caches by content_hash in `extract_cache`.
- If you change the prompt schema (Zod shape), update both this file AND
  `inngest/scrape.ts:upsert-people` mapping.

### `lib/scraping/llm.ts` — `callExtractLlm()`, `extractionProvider()`

- Provider switch: Gemini (default if `GEMINI_API_KEY` set) vs Anthropic Haiku
- Override via `LLM_EXTRACT_PROVIDER=anthropic|gemini`
- Only `extract.ts:extractPeople` calls this. Sonnet directory call goes
  direct to Anthropic SDK.

### `lib/scraping/trim.ts` — `trimMarkdown()`

- Called by `extract.ts:extractPeople` before LLM call
- Strips nav/footer/scoreboard/widget sections. Conservative pattern-match —
  if you suspect it's eating coach content, add a log and check `markdown.length`
  before/after.

### `extract_cache` table — content-hash skip cache

- Written by `extract.ts:extractPeople` (cache miss path)
- Read by same (cache hit short-circuits LLM call)
- Cleared by `npm run db:migrate` only if you drop the table; never auto-evicts

---

## Email enrichment (downstream of `inngest/email-enrich.ts`)

### `lib/email/patterns.ts` — `emailDomainCandidates()`, `generateCandidates()`, `DOMAIN_PATTERN_OVERRIDES`

- `emailDomainCandidates(websiteUrl)`: returns apex + `athletics.<apex>` for college sites
- `generateCandidates(person, domain)`: ordered list of email guesses using
  pattern overrides if known, generic patterns otherwise
- `DOMAIN_PATTERN_OVERRIDES`: 28 known domain patterns (Pitt, LAUSD, Tacoma SD, etc.)
- Used only by `inngest/email-enrich.ts`
- To add a new district: edit `DOMAIN_PATTERN_OVERRIDES` — no migration

### `lib/email/mx.ts` — `hasMx(domain)`

- Memoized DNS lookup via `dns.promises.resolveMx`
- Cache is in-process (resets per Inngest worker)
- Used only by `inngest/email-enrich.ts`

---

## UI primitives

### `components/ui/multi-select.tsx` — `MultiSelect`, `parseMultiParam()`

- The filter dropdown on **every** list page (`/schools`, `/people`)
- Stores selection as comma-separated string in hidden input → URL search param
- `parseMultiParam()` reverses it server-side (used in both list pages)
- Custom — no Radix dep. Outside-click + ESC close handled internally.

### `components/ui/pager.tsx` — `<Pager>`

- Numbered pagination (1 … 5 6 7 … 20)
- Used by `/schools` and `/people`
- Computes hrefs via `lib/pagination.ts:buildPageHref()`

### `components/ui/status-pill.tsx` — `<StatusPill>`

- Colored badge for `scrape_status` values
- Used by `/schools` list and `/schools/[id]` detail

### `components/ui/button.tsx` + `components/ui/input.tsx`

- CVA-based, no Radix. Standard shadcn-style.

### `components/app-nav.tsx`

- Sidebar nav. Hard-coded route list. Update when adding a top-level page.

---

## Server actions (mutation entry points)

| File | Mutates | Triggers |
|------|---------|----------|
| `app/(app)/schools/actions.ts` | `schools` | `scrape/school` event (single) |
| `app/(app)/schools/[id]/actions.ts` | `scrapeJobs`, `schools` | `scrape/school`, `email/enrich` |
| `app/(app)/schools/add/actions.ts` | `schools` (insert) | `scrape/school` (optional) |
| `app/(app)/schools/discover/actions.ts` | `discoveryJobs` | `discovery/run` |
| `app/(app)/schools/bulk-scrape.tsx`'s server action | many `scrapeJobs` rows | many `scrape/school` events |
| `app/(app)/people/[id]/actions.ts` | `people` | (none) |
| `app/(auth)/login/actions.ts` | `auth.users` (via Supabase) | (none) |

All Inngest events are sent via `inngest.send()`. The receiver lives in
`app/api/inngest/route.ts`.

---

## Inngest functions registry

`app/api/inngest/route.ts` is the **only** place Inngest discovers functions.
When you add an Inngest function, add it to the `functions: [...]` array there.

Currently registered:
- `helloWorld` (`inngest/hello-world.ts`) — smoke test
- `discoveryRun` (`inngest/discovery.ts`) — handles `discovery/run` event
- `scrapeSchool` (`inngest/scrape.ts`) — handles `scrape/school` event
- `emailEnrich` (`inngest/email-enrich.ts`) — handles `email/enrich` event

---

## Migrations

`/supabase/migrations/*.sql`, applied in filename order by `scripts/migrate.mjs`.
Idempotent (each uses `CREATE ... IF NOT EXISTS` or guards). Never edit a
migration that has been applied to a shared DB — write a new one.

Order matters because later migrations assume earlier columns exist.

---

## Dev scripts (`/scripts/`)

All gated by `_load-env.mjs` which reads `.env.local`. None of them are imported
by app code — they're CLI utilities for the dev. Safe to delete one-shots
post-use; safe to keep for diagnostic value.

- **Setup**: `migrate.mjs`, `seed.mjs`, `generate-magic-link.mjs`
- **Diagnostics** (read-only): `check-auth-users.mjs`, `check-school.mjs`,
  `check-coverage.mjs`, `check-scrape-jobs.mjs`, `check-extracted-people.mjs`
- **Probes** (no DB writes): `test-discover-urls.mjs`, `test-firecrawl-map.mjs`,
  `test-firecrawl-crawl.mjs`, `test-scrape-extract.mjs`
- **Test-data reset**: `reset-test-school.mjs`, `clear-test-school-website.mjs`
- **Emergency / one-shot data fix**: `cancel-stuck-scrape.mjs`,
  `normalize-divisions.mjs` (already ran 2026-05-12; idempotent, safe to re-run)

---

## Outdated / removed (don't reintroduce)

- ~~`components/ui/filter-select.tsx`~~ — deleted 2026-05-27, replaced by
  `multi-select.tsx`. If you find references in old docs, ignore them.
- ~~`schools.level = 'university'`~~ — added in migration 03, dropped in
  migration 06. Use `'college'` for both universities and colleges.
