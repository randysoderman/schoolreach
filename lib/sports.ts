// Canonical sport names used in form selects + filter dropdowns. The DB column
// is freeform text — these are the values we'd like the scraper to normalize
// to. Add freely; ordering is what users will see in selects.

export const SPORTS = [
  "Football",
  "Basketball",
  "Baseball",
  "Softball",
  "Soccer",
  "Volleyball",
  "Track & Field",
  "Cross Country",
  "Tennis",
  "Golf",
  "Wrestling",
  "Swimming & Diving",
  "Lacrosse",
  "Field Hockey",
  "Ice Hockey",
  "Cheerleading",
  "Gymnastics",
  "Rowing",
  "Water Polo",
  "Rugby",
  "Bowling",
  "Skiing",
  "Sailing",
  "Esports",
] as const;

export type Sport = (typeof SPORTS)[number];

// Map common LLM-emitted variants to our canonical names. Add aggressively
// as we observe drift — extractors often split "Swimming & Diving" into two
// rows, or emit "Men's Basketball" when "Basketball" with team_gender='mens'
// would dedupe better.
const SPORT_ALIASES: Record<string, Sport> = {
  // Swimming / Diving
  swimming: "Swimming & Diving",
  diving: "Swimming & Diving",
  "swim and dive": "Swimming & Diving",
  "swim & dive": "Swimming & Diving",
  // Track
  track: "Track & Field",
  "track and field": "Track & Field",
  "indoor track": "Track & Field",
  "outdoor track": "Track & Field",
  // Cross country variants
  xc: "Cross Country",
  "x-country": "Cross Country",
  // Drop gender prefix — that lives in team_gender
  "mens basketball": "Basketball",
  "men's basketball": "Basketball",
  "womens basketball": "Basketball",
  "women's basketball": "Basketball",
  "boys basketball": "Basketball",
  "girls basketball": "Basketball",
  "mens soccer": "Soccer",
  "men's soccer": "Soccer",
  "womens soccer": "Soccer",
  "women's soccer": "Soccer",
  "boys soccer": "Soccer",
  "girls soccer": "Soccer",
  "mens football": "Football",
  "men's football": "Football",
  "boys football": "Football",
  "mens lacrosse": "Lacrosse",
  "men's lacrosse": "Lacrosse",
  "womens lacrosse": "Lacrosse",
  "women's lacrosse": "Lacrosse",
  "mens volleyball": "Volleyball",
  "men's volleyball": "Volleyball",
  "womens volleyball": "Volleyball",
  "women's volleyball": "Volleyball",
  "boys volleyball": "Volleyball",
  "girls volleyball": "Volleyball",
  "mens tennis": "Tennis",
  "men's tennis": "Tennis",
  "womens tennis": "Tennis",
  "women's tennis": "Tennis",
  "boys tennis": "Tennis",
  "girls tennis": "Tennis",
  "mens golf": "Golf",
  "men's golf": "Golf",
  "womens golf": "Golf",
  "women's golf": "Golf",
  "boys golf": "Golf",
  "girls golf": "Golf",
  "mens track": "Track & Field",
  "men's track": "Track & Field",
  "womens track": "Track & Field",
  "women's track": "Track & Field",
  "mens track and field": "Track & Field",
  "men's track and field": "Track & Field",
  "womens track and field": "Track & Field",
  "women's track and field": "Track & Field",
  "mens cross country": "Cross Country",
  "men's cross country": "Cross Country",
  "womens cross country": "Cross Country",
  "women's cross country": "Cross Country",
  "boys cross country": "Cross Country",
  "girls cross country": "Cross Country",
  "mens swimming": "Swimming & Diving",
  "men's swimming": "Swimming & Diving",
  "womens swimming": "Swimming & Diving",
  "women's swimming": "Swimming & Diving",
  "mens wrestling": "Wrestling",
  "men's wrestling": "Wrestling",
  "boys wrestling": "Wrestling",
  "womens wrestling": "Wrestling",
  "women's wrestling": "Wrestling",
  "girls wrestling": "Wrestling",
  "mens gymnastics": "Gymnastics",
  "men's gymnastics": "Gymnastics",
  "womens gymnastics": "Gymnastics",
  "women's gymnastics": "Gymnastics",
  "girls gymnastics": "Gymnastics",
  "mens rowing": "Rowing",
  "men's rowing": "Rowing",
  "womens rowing": "Rowing",
  "women's rowing": "Rowing",
};

/**
 * Snap LLM-extracted sport names to canonical SPORTS values. If nothing
 * matches, return the original (so we don't drop genuinely-new sports —
 * we just won't filter on them until added to SPORTS).
 */
export function canonicalizeSport(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Exact match against canonical list
  if ((SPORTS as readonly string[]).includes(trimmed)) return trimmed;
  const key = trimmed.toLowerCase().replace(/[^a-z0-9 &'-]/g, "").replace(/\s+/g, " ").trim();
  if (SPORT_ALIASES[key]) return SPORT_ALIASES[key];
  // Last-ditch: case-insensitive match against canonical list
  const ciHit = SPORTS.find((s) => s.toLowerCase() === key);
  if (ciHit) return ciHit;
  return trimmed; // unknown sport — keep as-is
}

export const COACH_ROLES = [
  { value: "head_coach", label: "Head Coach" },
  { value: "assistant_head_coach", label: "Assistant Head Coach" },
  { value: "assistant_coach", label: "Assistant Coach" },
] as const;

// School-level-aware labels for team gender. DB stores canonical values
// (mens/womens/coed); display switches based on school.level.
import { isCollegeLike } from "./levels";

export function teamGenderOptions(level: string | null | undefined) {
  const collegeLike = isCollegeLike(level);
  return [
    {
      value: "mens",
      label: collegeLike ? "Mens" : "Boys",
    },
    {
      value: "womens",
      label: collegeLike ? "Womens" : "Girls",
    },
    { value: "coed", label: "Coed" },
  ] as const;
}

export function teamGenderLabel(
  value: string | null | undefined,
  level: string | null | undefined,
) {
  if (!value) return null;
  const opts = teamGenderOptions(level);
  return opts.find((o) => o.value === value)?.label ?? value;
}
