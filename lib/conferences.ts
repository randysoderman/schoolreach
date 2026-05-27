// Canonical athletic division + conference lists for filters and prompts.
// Stored values in the DB are the short canonical codes here (e.g. "D1",
// "ACC"), not the human-readable long names. Display layer adds the long
// form if needed.

export const DIVISIONS = [
  { value: "D1", label: "NCAA Division I (D1)" },
  { value: "D2", label: "NCAA Division II (D2)" },
  { value: "D3", label: "NCAA Division III (D3)" },
  { value: "NAIA", label: "NAIA" },
  { value: "JUCO", label: "NJCAA / JUCO" },
  { value: "USCAA", label: "USCAA" },
  { value: "CCCAA", label: "CCCAA (California CC)" },
  { value: "NWAC", label: "NWAC (Northwest Athletic)" },
  { value: "HS", label: "High School" },
] as const;

/**
 * Map LLM-extracted division strings to our canonical short codes.
 * Returns the canonical short code, or the original string if nothing
 * matched (so unfamiliar leagues aren't silently dropped).
 */
export function canonicalizeDivision(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();

  // NCAA Division I
  if (/ncaa\s*d(ivision)?\s*[1i]\b/.test(key)) return "D1";
  if (/^d[\-\s]?(1|i)$/.test(key)) return "D1";
  if (/division\s*[1i]\b/.test(key)) return "D1";

  // NCAA Division II
  if (/ncaa\s*d(ivision)?\s*(2|ii)\b/.test(key)) return "D2";
  if (/^d[\-\s]?(2|ii)$/.test(key)) return "D2";
  if (/division\s*(2|ii)\b/.test(key)) return "D2";

  // NCAA Division III
  if (/ncaa\s*d(ivision)?\s*(3|iii)\b/.test(key)) return "D3";
  if (/^d[\-\s]?(3|iii)$/.test(key)) return "D3";
  if (/division\s*(3|iii)\b/.test(key)) return "D3";

  if (/\bnaia\b/.test(key)) return "NAIA";
  if (/\bnjcaa\b|\bjuco\b/.test(key)) return "JUCO";
  if (/\buscaa\b/.test(key)) return "USCAA";
  if (/\bcccaa\b/.test(key)) return "CCCAA";
  if (/\bnwac\b/.test(key)) return "NWAC";

  // High school state associations / class labels (CIF, WIAA, UIL, NJSIAA, etc.)
  // Any class-letter or just the state-association acronym counts as HS.
  const hsAssociations = [
    "wiaa", "cif", "uil", "njsiaa", "psia", "ohsaa", "fhsaa", "ghsa",
    "miaa", "vhsl", "miaaa", "msaa", "khsaa", "ahsaa", "mhsaa",
    "ushaa", "iesa", "ihsaa", "mshsl", "phsaa", "vias", "vhsl",
  ];
  if (hsAssociations.some((a) => key.includes(a))) return "HS";
  if (/^\d[a-z]?$/.test(trimmed.toLowerCase())) return "HS"; // "3A", "5A", etc.

  return trimmed;
}

// ---------------------------------------------------------------------------
// Conferences — major D1 / D2 / D3 / NAIA leagues. Not exhaustive (there
// are 100+ HS state leagues) but covers the names you'll actually filter on.
// Display label is the conventional short name; freeform values are still
// allowed (extracted conference may not be in this list).
// ---------------------------------------------------------------------------
export const CONFERENCES = [
  // ---- FBS / Power 4 ----
  { value: "SEC", label: "SEC" },
  { value: "Big Ten", label: "Big Ten" },
  { value: "ACC", label: "ACC" },
  { value: "Big 12", label: "Big 12" },
  // ---- FBS / Group of 5 ----
  { value: "AAC", label: "American Athletic (AAC)" },
  { value: "C-USA", label: "Conference USA (C-USA)" },
  { value: "MAC", label: "Mid-American (MAC)" },
  { value: "Mountain West", label: "Mountain West" },
  { value: "Sun Belt", label: "Sun Belt" },
  { value: "Pac-12", label: "Pac-12" },
  // ---- D1 FCS + other D1 ----
  { value: "Ivy League", label: "Ivy League" },
  { value: "Patriot League", label: "Patriot League" },
  { value: "CAA", label: "Coastal Athletic (CAA)" },
  { value: "Big Sky", label: "Big Sky" },
  { value: "Big South", label: "Big South" },
  { value: "MVFC", label: "Missouri Valley Football (MVFC)" },
  { value: "SoCon", label: "Southern (SoCon)" },
  { value: "Southland", label: "Southland" },
  { value: "MEAC", label: "MEAC" },
  { value: "SWAC", label: "SWAC" },
  { value: "Pioneer League", label: "Pioneer Football League" },
  { value: "NEC", label: "Northeast (NEC)" },
  { value: "OVC", label: "Ohio Valley (OVC)" },
  { value: "Big East", label: "Big East" },
  { value: "A-10", label: "Atlantic 10 (A-10)" },
  { value: "WCC", label: "West Coast (WCC)" },
  { value: "MAAC", label: "MAAC" },
  { value: "MAC-Olympic", label: "MAC Olympic" },
  { value: "Summit League", label: "Summit League" },
  { value: "WAC", label: "WAC" },
  { value: "Horizon League", label: "Horizon League" },
  { value: "ASUN", label: "ASUN" },
  { value: "America East", label: "America East" },
  // ---- D2 ----
  { value: "GLIAC", label: "GLIAC (D2)" },
  { value: "GLVC", label: "GLVC (D2)" },
  { value: "GAC", label: "Great American (D2)" },
  { value: "Lone Star", label: "Lone Star (D2)" },
  { value: "MIAA", label: "MIAA (D2)" },
  { value: "Northeast-10", label: "Northeast-10 (D2)" },
  { value: "PSAC", label: "PSAC (D2)" },
  { value: "RMAC", label: "RMAC (D2)" },
  { value: "SAC", label: "South Atlantic (D2)" },
  { value: "Gulf South", label: "Gulf South (D2)" },
  { value: "NSIC", label: "NSIC (D2)" },
  { value: "CIAA", label: "CIAA (D2 HBCU)" },
  { value: "SIAC", label: "SIAC (D2 HBCU)" },
  // ---- D3 (selected major) ----
  { value: "NESCAC", label: "NESCAC (D3)" },
  { value: "Centennial", label: "Centennial (D3)" },
  { value: "UAA", label: "UAA (D3)" },
  { value: "Liberty League", label: "Liberty League (D3)" },
  { value: "WIAC", label: "WIAC (D3)" },
  { value: "MIAC", label: "MIAC (D3)" },
  // ---- NAIA / JUCO selected ----
  { value: "Frontier", label: "Frontier (NAIA)" },
  { value: "Heart of America", label: "Heart of America (NAIA)" },
  { value: "Sooner Athletic", label: "Sooner Athletic (NAIA)" },
] as const;

export type Division = (typeof DIVISIONS)[number]["value"];
export type Conference = (typeof CONFERENCES)[number]["value"];
