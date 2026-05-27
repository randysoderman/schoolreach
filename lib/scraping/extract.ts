// Claude-powered extraction. Two prompts:
//   1. pickDirectoryUrl(homepageMarkdown) — finds the staff/athletics directory link
//   2. extractPeople(markdown) — extracts person rows from a directory page
//
// Both run through `@anthropic-ai/sdk` and return Zod-validated JSON.

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { callExtractLlm, extractionProvider } from "./llm";
import { trimMarkdown } from "./trim";
import { db } from "@/lib/db/client";
import { extractCache } from "@/lib/db/schema";

// `pickDirectoryUrls` is a small reasoning task (find the right link from a
// busy homepage). We keep that on Anthropic Sonnet — only ~1 call per school,
// minor cost, and we want quality.
//
// `extractPeople` is structured extraction across many pages. That runs
// through the provider-agnostic adapter — defaults to Gemini Flash when
// GEMINI_API_KEY is set (8x cheaper, generous free tier), falls back to
// Anthropic Haiku otherwise. See lib/scraping/llm.ts.
const DIRECTORY_MODEL = "claude-sonnet-4-5";

let cachedAnthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Get one at https://console.anthropic.com/ and put it in .env.local.",
    );
  }
  cachedAnthropic = new Anthropic({ apiKey });
  return cachedAnthropic;
}

function extractTextResponse(message: Anthropic.Messages.Message): string {
  for (const block of message.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

/**
 * Pull a JSON object out of Claude's response, robust to common edge cases:
 *   1. A complete fenced block (```json ... ```)
 *   2. A truncated fenced block where the closing ``` got cut off
 *   3. Plain JSON with no fences
 *   4. JSON preceded by prose ("Here is the data: { ... }")
 *
 * Strategy: try the proper fence pattern first, then fall back to slicing
 * from the first `{` to the last `}`. The result still has to parse — caller
 * is responsible for JSON.parse and Zod validation.
 */
function stripFences(text: string): string {
  // 1. Complete fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  // 2. Opening fence but no close (response truncated) — take everything after it
  const openFence = text.match(/```(?:json)?\s*([\s\S]*)$/i);
  if (openFence) {
    const candidate = openFence[1].trim();
    const sliced = sliceOuterObject(candidate);
    if (sliced) return sliced;
  }
  // 3. Plain — look for the outermost JSON object
  const sliced = sliceOuterObject(text);
  if (sliced) return sliced;
  // 4. Nothing matched — return raw text for the parser to choke on with a
  // useful error in the caller's try/catch.
  return text.trim();
}

/** Slice from the first `{` to the last `}` in the input. */
function sliceOuterObject(s: string): string | null {
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return s.slice(first, last + 1).trim();
}

// ---------------------------------------------------------------------------
// Step 2: pick a directory URL from a homepage + school meta
// ---------------------------------------------------------------------------
const DirectoryHints = z.object({
  staff_directory_url: z.string().url().nullable(),
  athletics_url: z.string().url().nullable(),
  school_meta: z
    .object({
      conference: z.string().nullable(),
      division: z.string().nullable(),
      // School-level (organization) contact channels. Distinct from
      // individual people — these are the office/department generic
      // contacts often shown in the footer or contact-us section.
      admin_email: z.string().email().nullable().optional(),
      admin_phone: z.string().nullable().optional(),
      athletics_email: z.string().email().nullable().optional(),
      athletics_phone: z.string().nullable().optional(),
      booster_email: z.string().email().nullable().optional(),
      booster_phone: z.string().nullable().optional(),
      booster_url: z.string().url().nullable().optional(),
    })
    .default({ conference: null, division: null }),
});
export type DirectoryHints = z.infer<typeof DirectoryHints>;

export async function pickDirectoryUrls(
  homepageUrl: string,
  homepageMarkdown: string,
): Promise<DirectoryHints> {
  const client = getAnthropic();
  const message = await client.messages.create({
    model: DIRECTORY_MODEL,
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `You are looking at the homepage of a school website (${homepageUrl}). Identify the absolute URLs most likely to host:
  - the staff / faculty / leadership directory (principal, vice principal, dean, AD, counselors)
  - the athletics / coaches directory (head coaches, assistant coaches by sport)

These can be the SAME page or two different pages. Common patterns:
  - "/staff", "/staff-directory", "/our-staff", "/about/staff", "/administration"
  - "/athletics", "/athletics/coaches", "/sports/coaches", "/teams"
  - "About Us" → "Our Team" / "Leadership" sub-pages
  - Look for nav links like "Staff", "Faculty", "Athletics", "Sports", "Coaches", "Directory"

Also try to identify athletic conference and division if visible on the page:
  - conference: e.g. "ACC", "SEC", "Big Ten", "Pac-12", "Big 12", "AAC", "Mountain West", "Patriot League", "Ivy League", "Big Sky", "MEAC", "SWAC", or for high schools the league name like "3A SPSL", "WIAA", "CIF Southern Section". Only include if explicitly stated on the page.
  - division: e.g. "NCAA Division I", "NCAA D-II", "NAIA", "NJCAA", "WIAA 3A", "CIF D1". Only include if explicitly stated.

Also try to identify school-level organization contacts (often in the footer or a "Contact" section). Only include if EXPLICITLY shown on the page — do not pattern-guess:
  - admin_email / admin_phone: the front office / main administration. Often appears as "Main Office", "School Office", "Contact Us".
  - athletics_email / athletics_phone: the athletic department generic contact. Often appears as "Athletics Office", "Athletic Department", "athletics@school.edu".
  - booster_email / booster_phone / booster_url: the booster club (parent/community fundraising org), often a separate organization with its own website.

Return JSON only, with this shape:
{
  "staff_directory_url": "<absolute url or null>",
  "athletics_url": "<absolute url or null>",
  "school_meta": {
    "conference": "<string or null>",
    "division": "<string or null>",
    "admin_email": "<email or null>",
    "admin_phone": "<phone or null>",
    "athletics_email": "<email or null>",
    "athletics_phone": "<phone or null>",
    "booster_email": "<email or null>",
    "booster_phone": "<phone or null>",
    "booster_url": "<url or null>"
  }
}

If a candidate URL is a relative link, resolve it against ${homepageUrl}. Return null only if you genuinely don't see a candidate — but try hard. The best candidate is usually a hub/landing page, not a deep sub-page. Do not invent conference/division if not on the page.

Homepage content:
"""
${homepageMarkdown.slice(0, 30_000)}
"""`,
      },
    ],
  });
  const raw = stripFences(extractTextResponse(message));
  return DirectoryHints.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// Step 4: extract people from a directory page
// ---------------------------------------------------------------------------
const ExtractedPerson = z.object({
  full_name: z.string().min(1),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  role_category: z.enum(["coach", "leader", "staff"]),
  coach_role: z
    .enum(["head_coach", "assistant_head_coach", "assistant_coach"])
    .nullable()
    .optional(),
  team_gender: z.enum(["mens", "womens", "coed"]).nullable().optional(),
  sport: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  bio_url: z.string().url().nullable().optional(),
  photo_url: z.string().url().nullable().optional(),
  social_profiles: z
    .object({
      linkedin: z.string().url().nullable().optional(),
      twitter: z.string().url().nullable().optional(),
      instagram: z.string().url().nullable().optional(),
      facebook: z.string().url().nullable().optional(),
      tiktok: z.string().url().nullable().optional(),
      youtube: z.string().url().nullable().optional(),
    })
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1),
});
const ExtractionResult = z.object({
  people: z.array(ExtractedPerson),
});
export type ExtractedPerson = z.infer<typeof ExtractedPerson>;

const EXTRACTION_PROMPT = `You are extracting people from a school staff or athletics directory.

Return JSON only, with this exact shape:
{
  "people": [
    {
      "full_name": "string",
      "first_name": "string | null",
      "last_name": "string | null",
      "title": "string | null",
      "role_category": "coach" | "leader" | "staff",
      "coach_role": "head_coach" | "assistant_head_coach" | "assistant_coach" | null,
      "team_gender": "mens" | "womens" | "coed" | null,
      "sport": "string | null",
      "email": "string | null",
      "phone": "string | null",
      "bio_url": "string | null",
      "photo_url": "string | null",
      "social_profiles": { "linkedin": "url|null", "twitter": "url|null", "instagram": "url|null", "facebook": "url|null", "tiktok": "url|null", "youtube": "url|null" } | null,
      "confidence": 0.0
    }
  ]
}

Rules:
- INCLUDE (K-12): head coaches, assistant coaches, athletic directors, principals, vice/assistant principals, deans of students, activity coordinators, athletic trainers.
- INCLUDE (college / university): head coaches, assistant coaches, coordinators (offensive/defensive/strength), athletic directors, deputy/associate ADs, athletic department staff (compliance, equipment manager, sports info director, athletic trainer), chancellors, vice chancellors, provosts, deans (any school within the university).
- SKIP: students, parents, board members, district-level staff that don't work at this specific school, alumni profiles, donors, generic "support staff" rows.
- coach_role: only set if the person's title clearly indicates Head/Assistant/Assistant Head; otherwise null.
- team_gender: describes the GENDER OF THE TEAM the coach is responsible for, not the coach's own gender.
    * "mens" — coach of a men's or boys' team (e.g. "Men's Basketball Head Coach", "Boys Soccer Coach").
    * "womens" — coach of a women's or girls' team.
    * "coed" — ONLY when the team itself is mixed-gender (men and women on the same roster). Examples: some HS golf, sailing, cross country, equestrian, rifle. Verify the team is actually coed before using this — do NOT use "coed" just because a coach happens to oversee both a men's program and a women's program.
    * null — use this when the coach oversees BOTH a men's team AND a women's team as separate programs (e.g. "Director of Tennis" who runs both the men's and women's programs), or for non-coach roles, or when the gender is genuinely unclear.
  Use canonical values mens/womens/coed even for HS pages that say boys/girls — display layer will translate.
- sport: canonical name like "Football", "Basketball", "Track & Field". Null if not coach-related.
- social_profiles: only include URLs that are explicitly visible on the page (not guesses). Omit any platform without a URL by setting it to null. Set the whole object to null if no socials at all.
- confidence: 0-1, your certainty this is a real person at this school (not a navigation artifact, an example, etc.).
- DO NOT include any text outside the JSON. No commentary.`;

export async function extractPeople(
  pageUrl: string,
  markdown: string,
): Promise<ExtractedPerson[]> {
  const cleaned = trimMarkdown(markdown);
  const contentHash = createHash("sha256").update(cleaned).digest("hex");

  // Cache hit? Skip the LLM call entirely.
  const [cached] = await db
    .select({ peopleJson: extractCache.peopleJson })
    .from(extractCache)
    .where(
      sql`${extractCache.url} = ${pageUrl} and ${extractCache.contentHash} = ${contentHash}`,
    )
    .limit(1);
  if (cached) {
    // Bump usage counters; ignore failures.
    db.update(extractCache)
      .set({
        hitCount: sql`${extractCache.hitCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(
        sql`${extractCache.url} = ${pageUrl} and ${extractCache.contentHash} = ${contentHash}`,
      )
      .catch(() => {});
    return ExtractionResult.parse(cached.peopleJson).people;
  }

  const prompt = `${EXTRACTION_PROMPT}

Source URL: ${pageUrl}

Page content:
"""
${cleaned.slice(0, 60_000)}
"""`;
  // Provider chosen by lib/scraping/llm.ts based on env vars. Gemini Flash
  // returns guaranteed JSON (responseMimeType); Anthropic returns text which
  // may be wrapped in fences — stripFences handles both.
  const raw = stripFences(await callExtractLlm(prompt, 16_000));
  const parsed = ExtractionResult.parse(JSON.parse(raw));

  // Persist to cache on success. onConflictDoUpdate keeps the latest entry
  // for a given (url, hash) — re-runs with identical content just bump the
  // counters via the cache-hit path above.
  await db
    .insert(extractCache)
    .values({
      url: pageUrl,
      contentHash,
      peopleJson: parsed,
      llmProvider: extractionProvider(),
    })
    .onConflictDoUpdate({
      target: [extractCache.url, extractCache.contentHash],
      set: {
        peopleJson: parsed,
        llmProvider: extractionProvider(),
        lastUsedAt: new Date(),
      },
    });

  return parsed.people;
}
