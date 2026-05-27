// Urban Institute Education Data API client.
// Docs: https://educationdata.urban.org/documentation/index.html
// All endpoints are unauthenticated and free; we still validate every response
// with Zod so a schema drift surfaces immediately rather than silently
// corrupting our database.

import { z } from "zod";
import type { SchoolLevel } from "@/lib/db/schema";
import { codeForFips } from "@/lib/states";

const URBAN_BASE = "https://educationdata.urban.org/api/v1";
const PAGE_SIZE = 500;
const DEFAULT_YEAR = 2022;

// CCD school_level codes:
//   1 = primary, 2 = middle, 3 = high, 4 = other
// SPEC's level enum: elementary | middle | high | college | university | k12_combined
const CCD_LEVEL_TO_OUR_LEVEL: Record<number, SchoolLevel> = {
  1: "elementary",
  2: "middle",
  3: "high",
  4: "k12_combined",
};

const OUR_LEVEL_TO_CCD: Record<string, number | undefined> = {
  elementary: 1,
  middle: 2,
  high: 3,
  k12_combined: 4,
};

// ---------------------------------------------------------------------------
// CCD (K-12)
// ---------------------------------------------------------------------------
const CcdRow = z.object({
  ncessch: z.string(),
  school_name: z.string(),
  school_level: z.number().int().nullable(),
  state_location: z.string().nullable(),
  city_location: z.string().nullable(),
  street_location: z.string().nullable(),
  zip_location: z.string().nullable(),
  lea_name: z.string().nullable(),
  enrollment: z.number().int().nullable(),
  school_status: z.number().int().nullable().optional(),
});

const CcdResponse = z.object({
  count: z.number().int(),
  next: z.string().nullable(),
  results: z.array(CcdRow.passthrough()),
});

// ---------------------------------------------------------------------------
// IPEDS (colleges + universities)
// ---------------------------------------------------------------------------
const IpedsRow = z.object({
  unitid: z.number().int(),
  inst_name: z.string(),
  state_abbr: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  zip: z.string().nullable(),
  url_school: z.string().nullable(),
  sector: z.number().int().nullable(),
  institution_level: z.number().int().nullable(),
  currently_active_ipeds: z.number().int().nullable().optional(),
});

const IpedsResponse = z.object({
  count: z.number().int(),
  next: z.string().nullable(),
  results: z.array(IpedsRow.passthrough()),
});

// ---------------------------------------------------------------------------
// Mapped output shape — fields we'll upsert into `schools`.
// ---------------------------------------------------------------------------
export type DiscoveredSchool = {
  ncesId: string;
  name: string;
  level: SchoolLevel;
  state: string;
  city: string | null;
  district: string | null;
  streetAddress: string | null;
  zip: string | null;
  websiteUrl: string | null;
  enrollment: number | null;
  source: "nces" | "ipeds";
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------
async function fetchAllPages<T>(
  url: string,
  parse: (json: unknown) => { results: T[]; next: string | null },
): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(
        `Urban API ${res.status} ${res.statusText} on ${next}`,
      );
    }
    const json = await res.json();
    const parsed = parse(json);
    out.push(...parsed.results);
    next = parsed.next;
  }
  return out;
}

// ---------------------------------------------------------------------------
// K-12 (CCD)
// ---------------------------------------------------------------------------
export async function fetchK12Schools(opts: {
  fips: number;
  k12Levels: SchoolLevel[]; // any of: elementary, middle, high, k12_combined
  year?: number;
}): Promise<DiscoveredSchool[]> {
  const year = opts.year ?? DEFAULT_YEAR;
  const ccdLevels = opts.k12Levels
    .map((l) => OUR_LEVEL_TO_CCD[l])
    .filter((n): n is number => n !== undefined);
  if (ccdLevels.length === 0) return [];

  // The API accepts comma-separated values for multi-value filters.
  const params = new URLSearchParams({
    fips: String(opts.fips),
    school_level: ccdLevels.join(","),
    per_page: String(PAGE_SIZE),
  });
  const url = `${URBAN_BASE}/schools/ccd/directory/${year}/?${params}`;

  const rows = await fetchAllPages(url, (json) => {
    const parsed = CcdResponse.parse(json);
    return { results: parsed.results, next: parsed.next };
  });

  return rows.map(mapCcdToSchool).filter((s): s is DiscoveredSchool => s !== null);
}

function mapCcdToSchool(
  row: z.infer<typeof CcdRow>,
): DiscoveredSchool | null {
  const level =
    row.school_level != null ? CCD_LEVEL_TO_OUR_LEVEL[row.school_level] : null;
  if (!level) return null;
  if (!row.state_location) return null;
  return {
    ncesId: row.ncessch,
    name: row.school_name,
    level,
    state: row.state_location,
    city: row.city_location,
    district: row.lea_name,
    streetAddress: row.street_location,
    zip: row.zip_location,
    websiteUrl: null, // CCD has no website field; Step 7 finds it via Brave.
    enrollment: row.enrollment,
    source: "nces",
  };
}

// ---------------------------------------------------------------------------
// Higher ed (IPEDS)
// ---------------------------------------------------------------------------
export async function fetchHigherEd(opts: {
  fips: number;
  year?: number;
}): Promise<DiscoveredSchool[]> {
  const year = opts.year ?? DEFAULT_YEAR;
  const params = new URLSearchParams({
    fips: String(opts.fips),
    per_page: String(PAGE_SIZE),
  });
  const url = `${URBAN_BASE}/college-university/ipeds/directory/${year}/?${params}`;

  const rows = await fetchAllPages(url, (json) => {
    const parsed = IpedsResponse.parse(json);
    return { results: parsed.results, next: parsed.next };
  });

  return rows
    .filter((r) => r.currently_active_ipeds !== 0) // skip closed
    .map((row) => mapIpedsToSchool(row, opts.fips))
    .filter((s): s is DiscoveredSchool => s !== null);
}

function mapIpedsToSchool(
  row: z.infer<typeof IpedsRow>,
  fallbackFips: number,
): DiscoveredSchool | null {
  const stateCode = row.state_abbr ?? codeForFips(fallbackFips) ?? null;
  if (!stateCode) return null;

  let websiteUrl = row.url_school?.trim() || null;
  if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
    websiteUrl = `https://${websiteUrl.replace(/^\/+/, "")}`;
  }

  return {
    ncesId: String(row.unitid),
    name: row.inst_name,
    level: "college",
    state: stateCode,
    city: row.city,
    district: null,
    streetAddress: row.address,
    zip: row.zip,
    websiteUrl,
    enrollment: null,
    source: "ipeds",
  };
}

