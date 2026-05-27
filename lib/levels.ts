// School level constants and display labels. The DB stores short codes
// (`high`, `middle`, etc.); the UI renders proper names via `levelLabel`.

export const LEVELS = [
  "elementary",
  "middle",
  "high",
  "college",
  "k12_combined",
] as const;

export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  elementary: "Elementary School",
  middle: "Middle School",
  high: "High School",
  college: "College / University",
  k12_combined: "K-12 Combined",
};

export function levelLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return LEVEL_LABELS[value as Level] ?? value;
}

// Levels that use Mens/Womens vocabulary (vs HS-style Boys/Girls).
const COLLEGE_LIKE: ReadonlySet<string> = new Set(["college"]);

export function isCollegeLike(level: string | null | undefined): boolean {
  return !level || COLLEGE_LIKE.has(level);
}
