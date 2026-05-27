// Email pattern guessing for school staff. Most US K-12 districts and
// colleges use one of a small handful of canonical patterns; if we can
// pick the right one we get emails for everyone without an explicit
// mailto: on the source page.
//
// We don't *verify* mailboxes (catch-all servers accept anything anyway).
// Domains are MX-validated separately in lib/email/mx.ts. Guesses land in
// `people.email` with `email_status: 'unknown'` for human review.

const NON_ALPHANUMERIC = /[^a-z0-9]/g;
const MULTI_DASH = /-+/g;

function norm(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(NON_ALPHANUMERIC, "")
    .replace(MULTI_DASH, "-");
}

type NameParts = {
  first: string;
  last: string;
  firstInitial: string;
  lastInitial: string;
};

/**
 * Derive first/last components. Prefers explicit columns when populated,
 * otherwise splits full_name on whitespace.
 * - Drops common suffixes (Jr., Sr., II, III) before generating.
 * - Handles compound last names ("Van Der Berg" → "vanderberg").
 */
export function nameParts(person: {
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
}): NameParts | null {
  const tokens = person.fullName
    .trim()
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((t) => !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(t));

  let first = person.firstName ?? tokens[0] ?? "";
  let last =
    person.lastName ??
    (tokens.length >= 2 ? tokens.slice(1).join("") : "");

  first = norm(first);
  last = norm(last);
  if (!first || !last) return null;

  return {
    first,
    last,
    firstInitial: first[0],
    lastInitial: last[0],
  };
}

export type EmailPattern =
  | "first.last"
  | "firstinitial.last"
  | "firstinitial+last"
  | "first+last"
  | "first_last"
  | "first"
  | "last.first"
  | "last+firstinitial";

const PATTERN_FNS: Record<EmailPattern, (p: NameParts) => string> = {
  "first.last": (p) => `${p.first}.${p.last}`,
  "firstinitial.last": (p) => `${p.firstInitial}.${p.last}`,
  "firstinitial+last": (p) => `${p.firstInitial}${p.last}`,
  "first+last": (p) => `${p.first}${p.last}`,
  "first_last": (p) => `${p.first}_${p.last}`,
  "first": (p) => p.first,
  "last.first": (p) => `${p.last}.${p.first}`,
  "last+firstinitial": (p) => `${p.last}${p.firstInitial}`,
};

/** Default pattern ranking — most-common US school district patterns first. */
const DEFAULT_PATTERN_ORDER: EmailPattern[] = [
  "first.last",
  "firstinitial+last",
  "firstinitial.last",
  "first+last",
  "first_last",
];

/**
 * Per-district pattern overrides. Add entries as we confirm patterns by
 * cross-checking against any real emails the scraper does pick up. Keyed
 * on the registrable domain (e.g. `pitt.edu`, `tacomaschools.org`).
 */
export const DOMAIN_PATTERN_OVERRIDES: Record<string, EmailPattern[]> = {
  // ---- College athletics (verified from public staff directories) ----
  "athletics.pitt.edu": ["firstinitial+last", "first.last"],
  "gopsusports.com": ["first.last"], // Penn State athletics
  "psu.edu": ["firstinitial.last", "first.last"],
  "umich.edu": ["first.last", "firstinitial+last"], // Michigan
  "msu.edu": ["first.last", "firstinitial.last"], // Michigan State
  // Ohio State uses `<lastname>.<numeric-suffix>@osu.edu` which our generators
  // can't predict — intentionally omitted; their pattern requires lookup.
  "uga.edu": ["first.last", "firstinitial.last"], // Georgia
  "ufl.edu": ["first.last"], // Florida
  "vt.edu": ["firstinitial.last", "firstinitial+last"], // Virginia Tech
  "nd.edu": ["firstinitial.last", "first.last"], // Notre Dame
  "stanford.edu": ["firstinitial.last", "first.last"],
  "berkeley.edu": ["first.last", "firstinitial+last"],
  "ucla.edu": ["first.last", "firstinitial+last"],
  "usc.edu": ["first.last"],
  "duke.edu": ["firstinitial+last", "first.last"],
  "unc.edu": ["first.last"], // North Carolina
  "wisc.edu": ["first.last"], // Wisconsin

  // ---- College academic side ----
  "pitt.edu": ["first.last", "firstinitial.last"],

  // ---- K-12 districts (sample of larger / well-known) ----
  "tacomaschools.org": ["firstinitial+last", "first.last"],
  "lausd.net": ["first.last", "firstinitial.last"], // LA Unified
  "schools.nyc.gov": ["firstinitial+last"], // NYC DOE
  "cps.edu": ["first.last", "firstinitial+last"], // Chicago Public Schools
  "houstonisd.org": ["firstinitial+last", "first.last"], // Houston ISD
  "dadeschools.net": ["first.last", "firstinitial+last"], // Miami-Dade
  "browardschools.com": ["first.last"], // Broward FL
  "philasd.org": ["firstinitial+last"], // Philadelphia
  "boston.k12.ma.us": ["first.last", "firstinitial+last"],
  "denver.k12.co.us": ["first.last"],
  "phoenixuhsd.org": ["firstinitial+last"], // Phoenix Union
  "seattleschools.org": ["firstinitial+last", "first.last"],
  "atlanta.k12.ga.us": ["firstinitial+last"],
  "dallasisd.org": ["first.last"],
  "austinisd.org": ["first.last"], // Austin TX
  "fcps.edu": ["first.last", "firstinitial.last"], // Fairfax County VA
  "mcpsmd.org": ["first.last"], // Montgomery County MD
};

export function patternsForDomain(domain: string): EmailPattern[] {
  return DOMAIN_PATTERN_OVERRIDES[domain] ?? DEFAULT_PATTERN_ORDER;
}

/**
 * Derive plausible email-sending domain(s) from a school's website URL.
 *
 * `lincoln.tacomaschools.org` should also yield `tacomaschools.org`
 * (district-wide email domain). Colleges very commonly use an
 * `athletics.<apex>` subdomain for staff email (e.g. Pitt:
 * `athletics.pitt.edu`), so we add that as a candidate too.
 *
 * Returns candidates ordered most-likely-first.
 */
export function emailDomainCandidates(
  websiteUrl: string | null | undefined,
): string[] {
  if (!websiteUrl) return [];
  let host: string;
  try {
    host = new URL(websiteUrl).hostname.toLowerCase();
  } catch {
    return [];
  }
  if (!host) return [];
  host = host.replace(/^www\./, "");
  const seen = new Set<string>();
  const add = (d: string) => {
    if (d && !seen.has(d)) {
      seen.add(d);
    }
  };
  add(host);

  const parts = host.split(".");
  let apex = host;
  if (parts.length >= 3) {
    const looksLikeMultipartTld =
      parts[parts.length - 2].length <= 3 &&
      parts[parts.length - 3].length <= 3;
    apex = looksLikeMultipartTld
      ? parts.slice(-4).join(".") // e.g. lincoln.tacoma.k12.wa.us → tacoma.k12.wa.us
      : parts.slice(-2).join(".");
    add(apex);
  }

  // College athletics commonly use an athletics.<apex> subdomain.
  // Try athletics.<apex> as a high-likelihood guess.
  if (apex && !apex.startsWith("athletics.")) {
    add(`athletics.${apex}`);
  }

  return Array.from(seen);
}

/**
 * For a person + domain, generate ordered candidate emails using the
 * configured patterns for that domain.
 */
export function generateCandidates(
  person: { firstName?: string | null; lastName?: string | null; fullName: string },
  domain: string,
): string[] {
  const parts = nameParts(person);
  if (!parts) return [];
  const patterns = patternsForDomain(domain);
  return patterns.map((p) => `${PATTERN_FNS[p](parts)}@${domain}`);
}
