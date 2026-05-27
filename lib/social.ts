// Canonical social-platform keys we recognize on people.social_profiles.
// Adding a new platform here is enough — no DB migration needed since the
// column is JSONB.

export const SOCIAL_PLATFORMS = [
  { key: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/in/..." },
  { key: "twitter", label: "X / Twitter", placeholder: "https://x.com/..." },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/..." },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@..." },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@..." },
] as const;

export type SocialPlatformKey = (typeof SOCIAL_PLATFORMS)[number]["key"];
export type SocialProfiles = Partial<Record<SocialPlatformKey, string>>;

/**
 * Strip empty values, keep only known keys, return null if nothing remains.
 * Use this when persisting form input.
 */
export function normalizeSocialProfiles(
  raw: Record<string, unknown> | null | undefined,
): SocialProfiles | null {
  if (!raw || typeof raw !== "object") return null;
  const out: SocialProfiles = {};
  for (const { key } of SOCIAL_PLATFORMS) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) {
      out[key] = v.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function socialProfilesEntries(
  profiles: SocialProfiles | null | undefined,
): Array<{ key: SocialPlatformKey; label: string; url: string }> {
  if (!profiles) return [];
  const out: Array<{ key: SocialPlatformKey; label: string; url: string }> = [];
  for (const { key, label } of SOCIAL_PLATFORMS) {
    const url = profiles[key];
    if (url) out.push({ key, label, url });
  }
  return out;
}
