# SPEC.md — SchoolReach Build Plan

This is the living build spec. Update the Status section at the end of every work session.

---

## Status

**Current step**: Steps 1–7 complete + cleanup pass (2026-05-27). Scrape pipeline live and validated against real schools (Pitt: ~180 coaches across all sports, including email pattern guesses). Cost-optimized via Gemini Flash + markdown trim + content-hash cache. Multi-select filters + canonicalized conferences/divisions shipped. Repo pushed to https://github.com/randysoderman/schoolreach. Awaiting decision on Step 8 (Campaigns).

**Completed (high-level)**:
- ✅ **Step 1 — Bootstrap.** Next.js 14.2.35 + TS strict + Tailwind + shadcn/ui scaffold + Supabase clients + Drizzle. `.env.local` configured with Supabase URL, publishable + secret keys, `DATABASE_URL`.
- ✅ **Step 2 — Schema + migrations + seed.** All 8 tables created, RLS enabled, `set_updated_at()` trigger. Seed script populates 1 test school + 4 sample people (idempotent).
- ✅ **Step 3 — Auth + middleware + layout shell.** Supabase magic-link with `shouldCreateUser:false`. Callback handles both PKCE (`?code=`) and OTP (`?token_hash=&type=`) flows. Sidebar shell with nav + sign-out.
- ✅ **Step 4 — Schools + People pages.** Read/edit only. List filters, pagination, edit form with Zod validation, verified toggle.
- ✅ **Step 5 — Inngest setup.** Shared client, hello-world function, `/api/inngest` route. Inngest CLI installed locally (`--no-save`).
- ✅ **Step 6 — Discovery flow.** `/schools/discover` UI + `discovery/run` Inngest function. Dry-run + real-insert. Idempotent on `nces_id`.
- ✅ **Cleanup pass.** Extracted shared `StatusPill`, `MultiSelect`, `Pager`, `lib/pagination.ts`, `isUuid()`. Removed all known duplicates. (Original `FilterSelect` superseded by `MultiSelect` and deleted 2026-05-27.)
- ✅ **Refactor + docs pass (2026-05-27).** Deleted unused `components/ui/filter-select.tsx`. Added `TOUCHPOINTS.md` (helper → downstream consumers map). Refreshed `CLAUDE.md` with session-continuity guidance + standing user preferences.
- ✅ **Step 7 — Single-school scrape pipeline (production-quality)**. Five logical phases:
  1. `find_website` — Brave Search if no URL on file.
  2. `find_directory` — Firecrawl scrape of homepage + Claude **Sonnet** identifies staff_directory_url + athletics_url + extracts conference/division (e.g. ACC, NCAA Division I).
  3. `discover-coach-pages` — Firecrawl `/map` with both `search="coach"` and `search="staff"`; matches LIST_PATH_RE; **synthesizes `/sports/<slug>/coaches` per unique sport slug** observed in map results; same-hostname filter; cap 30 URLs.
  4. `pmap(directoryRoots, 3, processOne)` — each URL scrape+extract its own `step.run`, parallel waves of 3.
  5. `pmap(bioUrls, 3, processOne)` — follow up to 10 Claude-emitted bio_url's for social enrichment.
  6. Batch upsert deduped on `(school_id, full_name.lower(), title.lower())` with richness-aware merge (email > no email, etc.).
- ✅ **Cost optimization (4 shipped)**:
  1. **Gemini 2.5 Flash adapter** (`lib/scraping/llm.ts`). Defaults to Gemini Flash when `GEMINI_API_KEY` is set. ~8x cheaper than Haiku, no aggressive rate-limit on free tier. Native JSON mode (responseMimeType) → no fence-stripping needed.
  2. **Markdown trim** (`lib/scraping/trim.ts`) — strips nav/footer/scoreboard/widget sections before LLM. ~50% input token reduction, zero quality risk.
  3. **Content-hash skip cache** (`extract_cache` table, migration `...07`). Keyed on `(url, content_hash)`. Re-extraction of unchanged pages skips LLM entirely. Expect ~85% of monthly re-scrapes hit cache.
  4. **Parallel per-URL `step.run`** with concurrency cap of 3. Failures isolated; progress visible in Inngest UI.

- ✅ **Email enrichment Tier 1** (`inngest/email-enrich.ts` + `lib/email/{patterns.ts,mx.ts}` + "Guess missing emails" button on `/schools/[id]`). Generates pattern-based email candidates, MX-validates domain, persists best guess as `email_status='unknown'` (human-review-before-send). Pattern library knows Pitt athletics (`<flast>@athletics.pitt.edu`) and Tacoma Public Schools. `emailDomainCandidates` auto-tries `athletics.<apex>` for colleges.

- ✅ **`people.social_profiles jsonb`** (migration `...05`) — Claude extraction prompt pulls LinkedIn/X/Instagram/Facebook/TikTok/YouTube. Edit form on `/people/[id]` exposes URL inputs per platform. Canonical keys live in `lib/social.ts`.

**Validated on real schools**:
- *Lincoln HS Tacoma* (test seed school, WA): 21 real coaches + leadership extracted from a Finalsite-based site. No emails because the district uses contact forms — Tier-1 enrichment would generate `<flast>@tacomaschools.org` guesses.
- *University of Pittsburgh-Pittsburgh Campus*: ~180 people across all 15+ sports including football, M+W soccer, wrestling, lacrosse, with conference=ACC and division=NCAA Division I correctly extracted from the homepage.

**Production build + `tsc --noEmit`**: both green.

**Schema deviations from the original SPEC schema block** (see schema below for current canonical):
- `schools.level` CHECK: ...03 added `'university'`, then ...06 reverted (college covers both); current values are elementary/middle/high/college/k12_combined.
- `people.coach_role text` and `people.team_gender text` added (migration ...02)
- `discovery_jobs.dry_run boolean` and `discovery_jobs.error_message text` added (migration ...04)
- `people.social_profiles jsonb` added (migration ...05) — canonical platform keys in `lib/social.ts`
- `extract_cache` table added (migration ...07) — memoizes LLM extraction by `(url, content_hash)`

**Discovery freshness limitation**: Urban Institute pins to 2022 NCES/IPEDS data, so schools that opened in 2023+ won't be in the bulk discovery. Closed schools will surface but Step 7's scrape pipeline will fail to find websites/directories for them, naturally filtering them out. **Planned Step 6.5** (real-time discovery): Brave-Search-backed "find schools by query/area" path + per-school manual add. Coach data is always current — that comes from live scraping in Step 7.

**Next up**: Step 8 — Campaigns (create/preview/test-send + recipient picker, Tiptap editor, compliance enforcement). Optionally Step 6.5 first (real-time school discovery via Brave Search).

**Notes / blockers**:
- Resend domain verification in progress.
- Using new-format Supabase keys (`sb_publishable_*`, `sb_secret_*`).
- **Magic-link email delivery is not wired yet.** Sign in via `node scripts/generate-magic-link.mjs <email>` (prints a direct callback URL). The email must already exist in `auth.users` (we use `shouldCreateUser:false`). Real email delivery comes when we configure Resend SMTP in Supabase, planned around Step 9.
- PC Matic blocks the Inngest binary's first run; disable it on the dev machine for `npm run inngest:dev`.
- **Anthropic API rate limits matter**: the user's account is on an entry/unfunded tier — 10K input / 4K output tokens per minute — too tight for full-school scrapes against Anthropic. That's why we default extraction to Gemini Flash. Adding a payment method at https://console.anthropic.com/settings/billing auto-promotes to Tier 1 (~50K input / 10K output per min), but isn't required.

**Session-specific design decisions** (preserve through future sessions):
- Two-model LLM split: **Sonnet for `pickDirectoryUrls`** (once per school, reasoning), **Gemini Flash for `extractPeople`** (20-30 per school, structured extraction). Override with `LLM_EXTRACT_PROVIDER`.
- **Discovery uses Firecrawl `/map` with `search="coach"|"staff"`** AND synthesizes `/sports/<slug>/coaches` URLs from any observed sport slug. This is what catches Sidearm-style college sites where the search filter alone misses sports.
- **Pre-LLM markdown trim** (`lib/scraping/trim.ts`) strips Scoreboard / Departments / Honors / Quick Links sections. Conservative pattern-based — never strips coach content. Keeps cost down without quality cost.
- **Upsert dedupe is mandatory** before `INSERT ... ON CONFLICT DO UPDATE` because Postgres errors if the same target tuple appears twice in one batch. We dedupe in JS by `(school_id, fullName.lower(), title.lower())`, keeping highest-confidence row.
- **`extract_cache` table is the cost moat**. Long-term spend grows with the SCHEMA OF DATA (when sites change), not with the number of scrape runs.

**Planned schema/scraping additions** (track for future steps):
- **School-level contact rows we still need to capture per school**: main administration (front office) email + phone, main athletics office email + phone, booster club email + phone (and ideally booster club URL/website). These are organization-level contacts, not individual people, so they probably belong as new columns on `schools` (e.g. `admin_email`, `admin_phone`, `athletics_email`, `athletics_phone`, `booster_email`, `booster_phone`, `booster_url`) — *not* as rows in `people`. Update the find_directory + extraction prompts to look for and persist these alongside individual people.
- **Email enrichment** — first run of the scrape pipeline against Lincoln HS Tacoma extracted 21 real coaches at high confidence but zero emails (the district uses contact forms, not published mailto: links). Plan: add a post-extraction enrichment step that combines Brave-search-based social-profile lookup, district-level email-pattern guessing (e.g. Tacoma SD pattern is likely `<initial><lastname>@tacoma.k12.wa.us`), DNS/MX validation, and optionally Hunter.io as a paid upgrade.

**Deferred: Sidearm-specific HTML parser**:
- Idea was: detect Sidearm Sports sites (powering ~70% of NCAA D1 athletic sites), parse coach pages with cheerio instead of calling LLM. Would skip LLM cost for Sidearm pages.
- Decision (2026-05-12): not worth building. With Gemini Flash + markdown trim + content-hash cache, per-college cost is already ~$0.05. A Sidearm parser saves maybe $0.03/college, costs half a day + ongoing maintenance every time Sidearm rev's their markup, and removes LLM resilience.
- Revisit if/when: scaling to 10k+ colleges (savings become material), or if Sidearm-site extraction quality issues surface.

**Planned: multi-provider email architecture** (post-Step 8):
- Goal: best deliverability possible across mixed sending modes (cold outreach, opt-in newsletters, personalized 1-on-1).
- Auth: users authenticate with SchoolReach (existing Supabase magic-link). They do NOT bring their own auth.
- Storage: new `email_connections` table per team. Columns: `id`, `team_id` (future), `provider_type` ('resend_managed' | 'resend_byo_key' | 'gmail_oauth' | 'microsoft_oauth' | 'smtp'), `display_name`, `from_email`, `from_name`, `daily_cap`, `hourly_cap`, encrypted `credentials_json`, `last_warmup_score`, `created_at`.
- Per-campaign: existing `campaigns` table gains an `email_connection_id` FK so each campaign sends through a specific connection.
- Inngest send function delegates to per-provider adapter modules in `lib/email/adapters/{resend,gmail,microsoft,smtp}.ts`. Each adapter exposes the same `send(message)` interface.
- Implementation order:
  1. Step 8 ships with a single `resend_managed` adapter (current SPEC + minimal scope).
  2. Phase B adds `gmail_oauth` (Google Cloud project, OAuth flow, refresh-token storage in encrypted column, send via Gmail API). Best per-email deliverability for personal follow-ups.
  3. Phase C adds `microsoft_oauth` (Graph API), `smtp` (nodemailer), `resend_byo_key`.
  4. Phase D (much later, only if we scale): inbox rotation, warmup, automated bounce-pause-loop — i.e. the things Smartlead/Instantly do for cold outreach. Likely we'd integrate with one of those rather than rebuilding.
- Honest reality: no auth strategy alone delivers great deliverability for *cold* outreach at scale. Real-world strategy = our managed adapter for opt-in/transactional + Gmail OAuth for high-touch follow-ups + an external cold-email platform (Smartlead etc.) for true bulk cold sends. SchoolReach's job is the targeting + personalization + compliance; the sending tier is provider-agnostic.

---

## What we're building

A Next.js app for:
1. Discovering all elementary, high schools, and colleges in a given US state.
2. Scraping coach and school-leader (principal, AD, etc.) contact info from each school's website.
3. Running CAN-SPAM-compliant email campaigns to those contacts with merge-tag personalization.

Single-tenant. Solo team. No invitation flow needed.

## Database schema

Create migrations in `/supabase/migrations`. Every table has `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at` (with `set_updated_at()` trigger).

```sql
-- schools
create table schools (
  id uuid primary key default gen_random_uuid(),
  nces_id text unique,                    -- from NCES/IPEDS
  name text not null,
  level text not null check (level in ('elementary','middle','high','college','k12_combined')),  -- display labels in lib/levels.ts; college also covers university
  state text not null,                    -- 2-letter
  city text,
  district text,
  street_address text,
  zip text,
  website_url text,
  athletics_url text,
  staff_directory_url text,
  enrollment int,
  conference text,                        -- college only
  division text,                          -- college only
  source text not null,                   -- 'nces' | 'ipeds' | 'manual'
  last_scraped_at timestamptz,
  scrape_status text default 'pending',   -- pending | running | success | failed | skipped
  -- school-level (organization) contacts; populated by find_directory step
  admin_email text,
  admin_phone text,
  athletics_email text,
  athletics_phone text,
  booster_email text,
  booster_phone text,
  booster_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on schools (state, level);
create index on schools (scrape_status);

-- people
create table people (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  full_name text not null,
  first_name text,
  last_name text,
  title text,                              -- freeform raw title from source
  role_category text not null,             -- 'coach' | 'leader' | 'staff'
  coach_role text,                         -- 'head_coach' | 'assistant_head_coach' | 'assistant_coach' | other; only meaningful for coaches
  team_gender text check (team_gender is null or team_gender in ('mens','womens','coed')),  -- canonical; HS UI labels as Boys/Girls
  sport text,                              -- canonical sport name (Basketball, Soccer, etc.); see lib/sports.ts
  email text,
  phone text,
  bio_url text,
  photo_url text,
  source_url text,
  confidence_score numeric(3,2),
  verified boolean default false,
  email_status text default 'unknown',    -- unknown | valid | invalid | risky
  social_profiles jsonb,                  -- { linkedin?, twitter?, instagram?, facebook?, tiktok?, youtube? } — see lib/social.ts
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index on people (school_id, full_name, title);
create index on people (role_category, sport);
create index on people (email) where email is not null;
create index on people ((social_profiles is not null)) where social_profiles is not null;

-- scrape_jobs
create table scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  inngest_run_id text,
  status text not null,                   -- queued | running | success | failed
  stage text,                             -- find_website | crawl | extract | done
  pages_fetched int default 0,
  people_found int default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- discovery_jobs
create table discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  levels text[] not null,
  status text not null,
  schools_discovered int default 0,
  schools_enqueued int default 0,
  dry_run boolean not null default false,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- campaigns
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body_html text not null,
  body_text text not null,
  from_name text not null,
  from_email text not null,
  reply_to text,
  status text default 'draft',            -- draft | scheduled | sending | sent | paused
  scheduled_at timestamptz,
  send_rate_per_hour int default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- campaign_recipients
create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  status text default 'queued',
  resend_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  error_message text,
  created_at timestamptz default now()
);
create unique index on campaign_recipients (campaign_id, person_id);
create index on campaign_recipients (status);

-- segments
create table segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filters jsonb not null,
  created_at timestamptz default now()
);

-- suppressions
create table suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null,                   -- unsubscribe | bounce | complaint | manual
  created_at timestamptz default now()
);
```

## Auth

Supabase email magic-link. Middleware gates everything in `/(app)/*`. Manually add team emails to `auth.users`. RLS enabled on all tables; policies are simply "authenticated users can do everything" — we are not isolating tenants.

## School discovery (state → schools)

UI: `/schools/discover` with state dropdown, multi-select for levels, and a Discover button.

Inngest function `discovery/run`:
1. **K-12**: Urban Institute Education Data API — `https://educationdata.urban.org/api/v1/schools/ccd/directory/{year}/` filtered by `fips` (state) and `school_level`. Use most recent year available.
2. **College**: Same Urban Institute API — IPEDS directory endpoints.
3. Upsert into `schools` keyed on `nces_id`. Skip rows with no website hint.
4. Enqueue `scrape/school` Inngest event per new school. Throttle: 5 concurrent, 60/minute.

Document the exact endpoints in `/lib/discovery/README.md`.

## Per-school scrape pipeline

Inngest function `scrape/school` with `step.run()` for retry safety.

**Step 1 — find_website**: If `website_url` missing, query Brave Search with `"{school name} {city} {state}"`, pick best .edu / .org / .k12.xx.us / district result.

**Step 2 — find_directory**: Fetch homepage via Firecrawl. Use Claude (`claude-sonnet-4-5`) to identify the URL most likely to host a staff/coach/athletics directory. Save to `staff_directory_url` and/or `athletics_url`.

**Step 3 — crawl**: Firecrawl crawl scoped to directory URL, `maxDepth=2`, `limit=20`. Get markdown.

**Step 4 — extract**: Per page, send markdown to Claude with this prompt skeleton:

> You are extracting people from a school staff directory. Return JSON only matching this Zod schema: `{ people: Array<{ full_name, title, role_category: 'coach'|'leader'|'staff', sport?: string, email?: string, phone?: string, confidence: number }> }`. Confidence 0-1 reflects certainty this is a real person at this school. Only include coaches, principals, athletic directors, assistant/vice principals, deans, activity coordinators. Skip students, parents, board members.

Validate with Zod. Insert/update `people` keyed on `(school_id, full_name, title)`.

**Step 5 — finalize**: Update `schools.last_scraped_at`, `scrape_status`, and the `scrape_jobs` row.

Per-step retries: 3 with exponential backoff. Final failure logs to `scrape_jobs.error_message`.

## Email validation

After extraction, validate emails: regex shape, MX lookup via `dns.promises.resolveMx`, set `email_status`. Wrap in `/lib/email/validate.ts` as a clean abstraction so we can swap in NeverBounce/ZeroBounce later.

## Campaigns

Pages:
- `/campaigns` — list with status pills, sent count, open %, reply count, bounce rate
- `/campaigns/new` — form: name, subject, body (Tiptap), from name/email, reply-to
- `/campaigns/[id]` — recipient picker (saved Segment or inline filters), preview with merge tags, "Send test", "Schedule"

Merge tags: `{{first_name}}`, `{{last_name}}`, `{{full_name}}`, `{{school_name}}`, `{{sport}}`, `{{title}}`, `{{state}}`. Simple replacer — no templating library.

**Compliance enforcement**:
- Form refuses to save without `{{unsubscribe_url}}` in the body.
- Footer auto-appended with `COMPANY_POSTAL_ADDRESS` from env.
- Unsubscribe URL: `/unsubscribe?token=<signed_token>`, signs with `UNSUBSCRIBE_SECRET`, adds to `suppressions` on click.

Sending: Inngest function `campaign/send` fans out one event per recipient, throttled by `send_rate_per_hour`. Each recipient:
1. Check `suppressions` — if hit, mark `skipped`.
2. Render merged template.
3. Resend `send`.
4. Save `resend_id`, set `status=sent`.

Resend webhook at `/api/webhooks/resend/route.ts`, verify Svix signature, update `campaign_recipients` from events. Hard bounces and complaints add to `suppressions`.

## Pages to build (in order)

1. ✅ `/login`
2. 🟡 `/dashboard` — placeholder built; counts (schools, people, active campaigns), recent jobs still TODO
3. ✅ `/schools/discover`
4. ✅ `/schools` — paginated table, filter by state/level/scrape_status
5. ✅ `/schools/[id]` — detail + people list (sport→gender→head/asst sort) + Re-scrape + Guess emails + recent scrape jobs
6. ✅ `/people` — paginated table, filters: role/coach_role/team_gender/sport/state/has_email + smart Role column
7. ✅ `/people/[id]` — detail, edit (incl. social_profiles per platform), mark verified
8. ⏳ `/jobs` — discovery + scrape job log, live status (Supabase Realtime or 5s poll)
9. ⏳ `/campaigns` and children
10. ⏳ `/segments` — saved filter management

## Environment variables

Document in `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
ANTHROPIC_API_KEY=
FIRECRAWL_API_KEY=
BRAVE_SEARCH_API_KEY=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
COMPANY_POSTAL_ADDRESS=
UNSUBSCRIBE_SECRET=
```

## Build order

Stop after each step. Show me what to test before moving on.

1. ✅ **Bootstrap**: Next.js + Tailwind + shadcn/ui + Supabase clients + Drizzle. Generate `.env.example`.
2. ✅ **Schema + migrations** + seed script for one test school.
3. ✅ **Auth** + middleware + layout shell.
4. ✅ **Schools and people CRUD pages** (read/edit only — no scraping yet).
5. ✅ **Inngest setup** + hello-world function reachable at `/api/inngest`.
6. ✅ **Discovery flow** against NCES (one state, dry-run mode that doesn't insert).
   - 🔮 **6.5 (planned)**: real-time discovery via Brave Search to backfill schools post-2022 + per-school manual add.
7. ✅ **Single-school scrape pipeline** — validated against Lincoln HS Tacoma and University of Pittsburgh. Cost-optimized (Gemini Flash + markdown trim + content-hash cache + parallel steps). Email enrichment Tier 1 shipped (pattern guess + MX validate, "Guess missing emails" button).
8. ⏳ **Campaigns**: create, recipient picker, preview, test send.
9. ⏳ **Webhook + suppression flow.**
10. ⏳ **Job monitor page.**

## Out of scope for v1

Do not build any of these without explicit go-ahead:
- Multi-tenancy / orgs / invites
- A/B testing on campaigns
- Reply detection (only opens/clicks/bounces from Resend)
- SMS / phone outreach
- LinkedIn enrichment
- Mobile app

## Things to flag if hit

- NCES API rate limits or schema drift → tell me before working around it.
- Firecrawl returning nothing useful for a sample school → surface, don't silently skip.
- Any new dependency not listed in CLAUDE.md or this file → ask first.
