import "./_load-env.mjs";

const url = "https://lincoln.tacomaschools.org/fs/pages/7135";
const apiKey = process.env.FIRECRAWL_API_KEY;

// 1) Single-page scrape — should always work
console.log("\n=== SCRAPE single page ===");
const scrapeRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ url, formats: ["markdown"] }),
});
const scrape = await scrapeRes.json();
console.log("status:", scrapeRes.status);
console.log("success:", scrape.success);
console.log("markdown length:", (scrape.data?.markdown ?? scrape.markdown ?? "").length);
console.log("metadata.statusCode:", (scrape.data?.metadata ?? scrape.metadata)?.statusCode);
console.log("metadata.sourceURL:", (scrape.data?.metadata ?? scrape.metadata)?.sourceURL);
const md = scrape.data?.markdown ?? scrape.markdown ?? "";
console.log("first 300 chars:", md.slice(0, 300).replace(/\s+/g, " "));

// 2) Crawl with same params we use in the app
console.log("\n=== CRAWL ===");
const crawlRes = await fetch("https://api.firecrawl.dev/v2/crawl", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ url, limit: 12, maxDiscoveryDepth: 2, scrapeOptions: { formats: ["markdown"] } }),
});
const crawl = await crawlRes.json();
console.log("post status:", crawlRes.status);
console.log("crawl id:", crawl.id);
console.log("crawl url:", crawl.url);

// Poll the crawl job to completion
const jobUrl = crawl.url;
let pollCount = 0;
let last;
while (pollCount < 30) {
  const r = await fetch(jobUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
  last = await r.json();
  console.log(`poll ${pollCount}: status=${last.status}, completed=${last.completed}/${last.total}`);
  if (last.status === "completed" || last.status === "failed" || last.status === "cancelled") break;
  await new Promise((res) => setTimeout(res, 4000));
  pollCount++;
}
console.log("\nfinal status:", last?.status);
console.log("data length:", last?.data?.length ?? 0);
if (last?.data?.length) {
  for (const item of last.data) {
    console.log(" -", item.metadata?.sourceURL ?? item.metadata?.url, "md:", (item.markdown ?? "").length, "chars");
  }
}
