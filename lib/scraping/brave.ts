// Brave Web Search client. Used in the find_website step of the scrape
// pipeline. Free tier: 2000 queries/month.
// Docs: https://api.search.brave.com/app/documentation/web-search/get-started

import { z } from "zod";

const BraveResult = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string().optional(),
});
const BraveResponse = z.object({
  web: z
    .object({
      results: z.array(BraveResult.passthrough()),
    })
    .optional(),
});

function requireKey() {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    throw new Error(
      "BRAVE_SEARCH_API_KEY is not set. Get one at https://api.search.brave.com/ and put it in .env.local.",
    );
  }
  return key;
}

export async function braveSearch(
  query: string,
  count = 10,
): Promise<{ title: string; url: string; description?: string }[]> {
  const key = requireKey();
  const params = new URLSearchParams({ q: query, count: String(count) });
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": key,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Brave Search ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const parsed = BraveResponse.parse(json);
  return parsed.web?.results ?? [];
}

/**
 * Pick the most plausible school website from a list of search results.
 * Heuristics: prefer .edu / *.k12.<state>.us / district domains and the
 * shortest path (i.e. the homepage rather than a blog post or staff page).
 */
export function pickBestSchoolUrl(
  results: { title: string; url: string; description?: string }[],
): string | null {
  if (results.length === 0) return null;

  const scored = results.map((r) => {
    let score = 0;
    const u = new URL(r.url);
    const host = u.hostname.toLowerCase();
    if (host.endsWith(".edu")) score += 10;
    if (/\.k12\.[a-z]{2}\.us$/.test(host)) score += 8;
    if (host.endsWith(".org")) score += 3;
    if (host.endsWith(".gov") || host.endsWith(".gov.us")) score += 5;
    if (host.includes("school") || host.includes("district")) score += 2;
    // Prefer homepages: shorter paths score higher.
    const pathSegments = u.pathname.split("/").filter(Boolean).length;
    score += Math.max(0, 4 - pathSegments);
    return { ...r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].url : results[0].url;
}
