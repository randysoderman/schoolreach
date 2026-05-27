// Firecrawl SDK wrappers (v4 API). Single-page scrape and scoped multi-page
// crawl. Errors throw — no need to inspect a `success` flag.
// Docs: https://docs.firecrawl.dev/

import Firecrawl from "@mendable/firecrawl-js";

let cachedApp: Firecrawl | null = null;

function getApp(): Firecrawl {
  if (cachedApp) return cachedApp;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FIRECRAWL_API_KEY is not set. Get one at https://www.firecrawl.dev/ and put it in .env.local.",
    );
  }
  cachedApp = new Firecrawl({ apiKey });
  return cachedApp;
}

export type ScrapedPage = {
  url: string;
  markdown: string;
};

/** Single-page scrape. Returns markdown content for the URL. */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  const app = getApp();
  const doc = await app.scrape(url, { formats: ["markdown"] });
  return {
    url: doc.metadata?.sourceURL ?? doc.metadata?.url ?? url,
    markdown: doc.markdown ?? "",
  };
}

/**
 * Map a site — return the list of URLs Firecrawl knows about under the
 * given URL. Cheap (one request, no per-page scrape). Useful for
 * discovering coach/staff sub-pages on athletic sites.
 */
export async function mapSite(
  url: string,
  opts: { search?: string; limit?: number; includeSubdomains?: boolean } = {},
): Promise<string[]> {
  const app = getApp();
  const data = await app.map(url, {
    search: opts.search,
    limit: opts.limit ?? 200,
    includeSubdomains: opts.includeSubdomains ?? false,
  });
  return data.links.map((l) => l.url);
}

/**
 * Scoped multi-page crawl. `limit` caps total pages; `maxDepth` how far from
 * the root URL to follow links.
 */
export async function crawlSite(
  url: string,
  opts: { limit?: number; maxDepth?: number } = {},
): Promise<ScrapedPage[]> {
  const app = getApp();
  const job = await app.crawl(url, {
    limit: opts.limit ?? 20,
    maxDiscoveryDepth: opts.maxDepth ?? 2,
    scrapeOptions: { formats: ["markdown"] },
  });
  if (job.status !== "completed") {
    throw new Error(`Firecrawl crawl ${job.id} ended with status ${job.status}`);
  }
  const pages: ScrapedPage[] = [];
  for (const item of job.data) {
    const md = item.markdown ?? "";
    const pageUrl = item.metadata?.sourceURL ?? item.metadata?.url ?? url;
    if (md) pages.push({ url: pageUrl, markdown: md });
  }
  return pages;
}
