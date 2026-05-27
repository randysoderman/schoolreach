# CLAUDE.md

This file is read by Claude Code at the start of every session. It contains the durable rules and conventions for the SchoolReach project.

**Read these three in order before doing anything:**
1. `CLAUDE.md` (this file) — rules + conventions
2. `SPEC.md` — schema, build plan, current status
3. `TOUCHPOINTS.md` — helper → downstream map (which files feel a change)

---

## Project summary

SchoolReach is a Next.js app for discovering schools by state, scraping coach and school-leader contact info, and running email outreach campaigns. Single-tenant, solo team, deployed on Vercel.

## Tech stack — use exactly these

- **Framework**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Database & auth**: Supabase (Postgres, Supabase Auth, Storage)
- **ORM**: Drizzle for app code; raw SQL for migrations in `/supabase/migrations`
- **Background jobs**: Inngest
- **Web scraping**: Firecrawl (`@mendable/firecrawl-js` v4 — `scrape` + `crawl` + `map`)
- **LLM extraction (two-model split)**:
  - **Directory finding** (one call per school, picks staff/athletics URLs + conference/division): Anthropic SDK, model `claude-sonnet-4-5`
  - **Per-page people extraction** (20-30 calls per school): provider-agnostic via `lib/scraping/llm.ts`. Defaults to **Gemini 2.5 Flash** (`gemini-2.5-flash`, native JSON mode) when `GEMINI_API_KEY` is set. Falls back to Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`) otherwise. Override with `LLM_EXTRACT_PROVIDER=anthropic|gemini`.
- **Search**: Brave Search API (for finding school websites)
- **Email**: Resend
- **Validation**: Zod everywhere user input or external data crosses a boundary
- **Rich text editor**: Tiptap

## File layout

```
/app
  layout.tsx                  # root layout (no UI; middleware handles routing)
  globals.css                 # Tailwind + shadcn CSS vars
  /(auth)/login               # magic-link sign-in
  /(app)                      # gated by middleware; sidebar shell layout
    /dashboard                # placeholder — counts come later
    /schools                  # list + /[id] detail + /discover
    /people                   # list + /[id] edit
    /campaigns                # not yet built (Step 8)
    /jobs                     # not yet built (Step 10)
    /segments                 # not yet built (Step 8/10)
  /auth
    /callback/route.ts        # magic-link verify (handles ?code= and ?token_hash=)
    /signout/route.ts         # POST → signOut → /login
  /api
    /inngest/route.ts         # registers all Inngest functions
    /webhooks/resend/route.ts # not yet built (Step 9)

/components
  app-nav.tsx                 # sidebar nav
  /ui                         # shadcn-style primitives
    button.tsx                # CVA-based, no Radix
    input.tsx
    multi-select.tsx          # comma-CSV dropdown filter (used by every list page)
    status-pill.tsx           # colored status badge
    pager.tsx                 # numbered pagination jumper (1 … 5 6 7 … 20)

/inngest                      # background-job definitions
  client.ts                   # shared Inngest client (id: "schoolreach")
  hello-world.ts              # smoke-test function
  discovery.ts                # discovery/run (Urban Institute CCD + IPEDS)
  scrape.ts                   # scrape/school 5-step pipeline (parallel)
  email-enrich.ts             # email/enrich (Tier-1 pattern guess + MX)

/lib
  utils.ts                    # cn() + isUuid()
  pagination.ts               # PAGE_SIZE + parsePageParam + buildPageHref
  states.ts                   # 50+DC with FIPS codes + helpers
  levels.ts                   # LEVELS + LEVEL_LABELS + isCollegeLike
  sports.ts                   # SPORTS + COACH_ROLES + teamGenderOptions/Label
  social.ts                   # SOCIAL_PLATFORMS + normalize/entries helpers
  conferences.ts              # DIVISIONS + CONFERENCES + canonicalizeDivision
  /db                         # Drizzle schema + client
  /supabase                   # server + browser + middleware clients
  /discovery                  # Urban Institute API client (CCD + IPEDS)
  /scraping
    brave.ts                  # Brave web search + pickBestSchoolUrl
    firecrawl.ts              # scrapePage / crawlSite / mapSite (v4 SDK)
    extract.ts                # pickDirectoryUrls + extractPeople (LLM-driven)
    llm.ts                    # provider-agnostic LLM adapter (Gemini / Anthropic)
    trim.ts                   # markdown pre-trim (strip nav / footer / widgets)
  /email
    patterns.ts               # pattern library + emailDomainCandidates
    mx.ts                     # memoized DNS MX lookup

/scripts                      # dev tools (no new deps; .mjs uses _load-env.mjs)
  _load-env.mjs               # loads .env.local manually
  migrate.mjs                 # npm run db:migrate
  seed.mjs                    # npm run db:seed
  generate-magic-link.mjs     # sign-in helper while SMTP isn't wired
  check-auth-users.mjs        # auth.users diagnostic
  check-school.mjs            # dump a school's state + recent scrape jobs
  check-coverage.mjs          # sport/role breakdown for a school's people
  cancel-stuck-scrape.mjs     # mark stuck running jobs failed (use sparingly)
  reset-test-school.mjs       # nulls website/directory URLs on Lincoln test school
  test-firecrawl-*.mjs        # diagnostic probes for Firecrawl APIs
  test-discover-urls.mjs      # what list-pages discover-coach-pages would find
  test-scrape-extract.mjs     # scrape one URL + run extract prompt against it

/supabase/migrations          # raw SQL, applied by scripts/migrate.mjs
middleware.ts                 # session refresh + route gating
```

## Dev workflow

Two terminals:

- `npm run dev` — Next.js on http://localhost:3000
- `npm run inngest:dev` — Inngest dev UI on http://localhost:8288 (registered functions auto-discovered)

Database:

- `npm run db:migrate` — apply any new `supabase/migrations/*.sql` (idempotent)
- `npm run db:seed` — upsert the test school + 4 sample people
- `npm run typecheck` — `tsc --noEmit`

Sign-in (until SMTP is configured around Step 9):

- `node scripts/generate-magic-link.mjs <email>` — prints a one-time URL that drops the session cookie when pasted into the browser. The email must already exist in Supabase `auth.users` (we use `shouldCreateUser:false`).

**`next build` and `npm run dev` clash on `.next/`.** Always stop the dev server and `rm -rf .next` before running a production build, otherwise the dev server breaks (CSS/JS 404s) AND/OR the build errors with a stale PageNotFoundError. Re-run `npm run dev` after.

## Required env vars in `.env.local`

Minimum for the app to function:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`sb_publishable_*` form), `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_*` form), `DATABASE_URL` — Supabase + direct Postgres
- `ANTHROPIC_API_KEY` — used for `pickDirectoryUrls` (Sonnet) and as extraction fallback
- `FIRECRAWL_API_KEY` — page scraping
- `BRAVE_SEARCH_API_KEY` — used by `find_website` step when a school has no URL

Recommended for cost reduction:
- `GEMINI_API_KEY` — switches extraction to Gemini 2.5 Flash (~8x cheaper than Anthropic Haiku, no aggressive rate-limit on free tier). Without it, extraction uses Anthropic Haiku.
- `LLM_EXTRACT_PROVIDER` — explicit override: `gemini` or `anthropic`. Defaults to gemini when `GEMINI_API_KEY` is set.

Required before sending campaigns (Steps 8-9):
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- `COMPANY_POSTAL_ADDRESS` — CAN-SPAM footer
- `UNSUBSCRIBE_SECRET` — signed unsubscribe token

## Coding conventions

- TypeScript strict mode. No `any` without a comment explaining why.
- Server components by default. Mark client components explicitly with `"use client"`.
- Prefer server actions for mutations over API routes, except for webhooks and the Inngest endpoint.
- All external data (API responses, scrape results) is parsed through a Zod schema before use.
- Errors bubble up — don't swallow them. Log via the Inngest function context for background jobs and via `console.error` (with structured fields) for request handlers.
- Database access via Drizzle. No raw SQL in app code; use Drizzle's query builder. Raw SQL is reserved for migrations.
- Keep route handlers thin. Logic lives in `/lib`.

## Standing rules for Claude Code

These apply to every session and every change.

1. **Stop after each step in the build order.** Show me what to test before moving on. Don't string multiple build steps together.
2. **Never add a dependency that isn't listed in this file or SPEC.md without asking first.** If you think one is needed, propose it and wait.
3. **Never commit secrets.** `.env.local` and any file matching `*.env*` (except `.env.example`) must be gitignored.
4. **Update SPEC.md when scope or decisions change.** If we change our mind on a tool, schema field, or flow, update SPEC.md in the same change.
5. **Surface failures, don't paper over them.** If an external API returns nothing useful, tell me — don't silently retry forever or fake data.
6. **Ask before destructive operations.** Dropping tables, deleting rows, force-pushing, etc. — confirm first.
7. **Prefer the simplest thing that works.** Resist abstraction layers we don't need yet. We're solo team, single-tenant, and not optimizing for scale we don't have.

## Compliance rules — non-negotiable

- Every outbound email must include a working unsubscribe link and a physical postal address (CAN-SPAM).
- The campaign builder must refuse to save a template missing `{{unsubscribe_url}}`.
- Hard bounces and complaints from Resend webhooks auto-add the email to the `suppressions` table.
- Before sending to any recipient, check `suppressions` and skip if matched.
- Respect `robots.txt` when scraping. Firecrawl handles this by default — don't override it.
- Rate-limit scraping per domain. Default: max 5 concurrent scrapes total, max 1 concurrent per domain.

## Working with SPEC.md

`SPEC.md` is the source of truth for:
- The database schema
- The list of pages to build
- The build order with completion status
- What's in scope and out of scope

When something changes, update `SPEC.md` so the next session has accurate context. At the end of each work session, update the "Status" section to reflect what's done.

## What to do at the start of every session

1. Read this file (CLAUDE.md).
2. Read SPEC.md, especially the Status section.
3. Read TOUCHPOINTS.md if you'll be editing anything in `/lib`.
4. Confirm what we're working on next.
5. Begin work, stopping after the current step finishes.

## Session continuity — survive disconnects

Anything you'd want a fresh-context Claude to know lives in one of these:

- **Architecture / conventions** → CLAUDE.md (this file)
- **Build status / schema / next step** → SPEC.md > Status
- **Helper → downstream consumers** → TOUCHPOINTS.md
- **Cross-session preferences + user profile** → auto-memory (off-repo, lives
  in `~/.claude/projects/.../memory/`; survives between sessions but NOT
  between machines — rebuild on a new machine)

If you make a decision that future-you would need to know (e.g. "we picked
Gemini Flash over Haiku because rate limit"), write it into SPEC.md's Status
section **in the same change**, not a separate doc. Don't create new
session-handoff files.

## Standing user preferences (from accumulated feedback)

These are stable; treat as defaults unless the user says otherwise in-session.

- **Proceed without asking.** Keep building. Only stop when you need user
  input that you can't infer.
- **No git push without explicit go-ahead.** Local commits are fine.
- **Paste full contents inline.** When showing SQL, config, or commands, put
  the actual content in a code block — don't reference a file path.
- **Give clickable URLs for any manual step.** Full https:// links.
- **For UI changes, actually test in browser.** Typecheck passing isn't
  "done." If you can't test, say so explicitly.
- **User is non-technical.** Explain decisions in plain language. Don't
  assume familiarity with TypeScript, SQL, or React internals.

## What NOT to put in CLAUDE.md / SPEC.md / TOUCHPOINTS.md

Keep these files lean. Out-of-band:

- Per-task work logs ("today I refactored X") — that's git history
- Detailed code snippets — that's the code
- Step-by-step debug recipes — that's the commit message
- One-shot script invocations — that's the terminal history
- Anything that will rot in a week (PR numbers, ticket links, current cursor
  state, "next we'll try…")

If you find yourself writing a section that's mostly past tense, it probably
doesn't belong here.
