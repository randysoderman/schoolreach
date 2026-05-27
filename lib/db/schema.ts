import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// String unions enforced at the DB level via check constraints (level only)
// or by convention. Mirrored here so app code gets type-safety on inserts.
export type SchoolLevel =
  | "elementary"
  | "middle"
  | "high"
  | "college"
  | "k12_combined";
export type SchoolSource = "nces" | "ipeds" | "manual";
export type ScrapeStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";
export type RoleCategory = "coach" | "leader" | "staff";
export type CoachRole =
  | "head_coach"
  | "assistant_head_coach"
  | "assistant_coach";
export type TeamGender = "mens" | "womens" | "coed";
export type EmailStatus = "unknown" | "valid" | "invalid" | "risky";
export type ScrapeJobStatus = "queued" | "running" | "success" | "failed";
export type ScrapeJobStage =
  | "find_website"
  | "find_directory"
  | "crawl"
  | "extract"
  | "done";
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "paused";
export type RecipientStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "skipped";
export type SuppressionReason =
  | "unsubscribe"
  | "bounce"
  | "complaint"
  | "manual";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

// ---------------------------------------------------------------------------
// schools
// ---------------------------------------------------------------------------
export const schools = pgTable(
  "schools",
  {
    id: id(),
    ncesId: text("nces_id").unique(),
    name: text("name").notNull(),
    level: text("level").notNull().$type<SchoolLevel>(),
    state: text("state").notNull(),
    city: text("city"),
    district: text("district"),
    streetAddress: text("street_address"),
    zip: text("zip"),
    websiteUrl: text("website_url"),
    athleticsUrl: text("athletics_url"),
    staffDirectoryUrl: text("staff_directory_url"),
    enrollment: integer("enrollment"),
    conference: text("conference"),
    division: text("division"),
    source: text("source").notNull().$type<SchoolSource>(),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    scrapeStatus: text("scrape_status").$type<ScrapeStatus>().default("pending"),
    // School-level (organization) contacts. NOT individual people.
    adminEmail: text("admin_email"),
    adminPhone: text("admin_phone"),
    athleticsEmail: text("athletics_email"),
    athleticsPhone: text("athletics_phone"),
    boosterEmail: text("booster_email"),
    boosterPhone: text("booster_phone"),
    boosterUrl: text("booster_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    stateLevelIdx: index("schools_state_level_idx").on(t.state, t.level),
    scrapeStatusIdx: index("schools_scrape_status_idx").on(t.scrapeStatus),
  }),
);

// ---------------------------------------------------------------------------
// people
// ---------------------------------------------------------------------------
export const people = pgTable(
  "people",
  {
    id: id(),
    schoolId: uuid("school_id").references(() => schools.id, {
      onDelete: "cascade",
    }),
    fullName: text("full_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    title: text("title"),
    roleCategory: text("role_category").notNull().$type<RoleCategory>(),
    coachRole: text("coach_role").$type<CoachRole | string>(),
    teamGender: text("team_gender").$type<TeamGender>(),
    sport: text("sport"),
    email: text("email"),
    phone: text("phone"),
    bioUrl: text("bio_url"),
    photoUrl: text("photo_url"),
    sourceUrl: text("source_url"),
    confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }),
    verified: boolean("verified").default(false),
    emailStatus: text("email_status").$type<EmailStatus>().default("unknown"),
    socialProfiles: jsonb("social_profiles").$type<
      import("@/lib/social").SocialProfiles
    >(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    schoolNameTitleIdx: uniqueIndex("people_school_name_title_idx").on(
      t.schoolId,
      t.fullName,
      t.title,
    ),
    roleSportIdx: index("people_role_sport_idx").on(t.roleCategory, t.sport),
    emailIdx: index("people_email_idx")
      .on(t.email)
      .where(sql`${t.email} is not null`),
  }),
);

// ---------------------------------------------------------------------------
// scrape_jobs
// ---------------------------------------------------------------------------
export const scrapeJobs = pgTable("scrape_jobs", {
  id: id(),
  schoolId: uuid("school_id").references(() => schools.id, {
    onDelete: "cascade",
  }),
  inngestRunId: text("inngest_run_id"),
  status: text("status").notNull().$type<ScrapeJobStatus>(),
  stage: text("stage").$type<ScrapeJobStage>(),
  pagesFetched: integer("pages_fetched").default(0),
  peopleFound: integer("people_found").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// discovery_jobs
// ---------------------------------------------------------------------------
export const discoveryJobs = pgTable("discovery_jobs", {
  id: id(),
  state: text("state").notNull(),
  levels: text("levels").array().notNull().$type<SchoolLevel[]>(),
  status: text("status").notNull(),
  schoolsDiscovered: integer("schools_discovered").default(0),
  schoolsEnqueued: integer("schools_enqueued").default(0),
  dryRun: boolean("dry_run").notNull().default(false),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// campaigns
// ---------------------------------------------------------------------------
export const campaigns = pgTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text").notNull(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  replyTo: text("reply_to"),
  status: text("status").$type<CampaignStatus>().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sendRatePerHour: integer("send_rate_per_hour").default(100),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// campaign_recipients
// ---------------------------------------------------------------------------
export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: id(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "cascade",
    }),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "cascade",
    }),
    status: text("status").$type<RecipientStatus>().default("queued"),
    resendId: text("resend_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (t) => ({
    campaignPersonIdx: uniqueIndex(
      "campaign_recipients_campaign_person_idx",
    ).on(t.campaignId, t.personId),
    statusIdx: index("campaign_recipients_status_idx").on(t.status),
  }),
);

// ---------------------------------------------------------------------------
// segments
// ---------------------------------------------------------------------------
export const segments = pgTable("segments", {
  id: id(),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// suppressions
// ---------------------------------------------------------------------------
export const suppressions = pgTable("suppressions", {
  id: id(),
  email: text("email").notNull().unique(),
  reason: text("reason").notNull().$type<SuppressionReason>(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// extract_cache — memoizes LLM extraction by (url, content_hash). Re-scraping
// an unchanged page reuses the cached result and skips the LLM call.
// ---------------------------------------------------------------------------
export const extractCache = pgTable(
  "extract_cache",
  {
    id: id(),
    url: text("url").notNull(),
    contentHash: text("content_hash").notNull(),
    peopleJson: jsonb("people_json").notNull(),
    llmProvider: text("llm_provider").notNull(),
    hitCount: integer("hit_count").notNull().default(0),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    urlHashIdx: uniqueIndex("extract_cache_url_hash_idx").on(
      t.url,
      t.contentHash,
    ),
  }),
);
