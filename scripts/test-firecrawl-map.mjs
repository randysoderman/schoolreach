import "./_load-env.mjs";

const apiKey = process.env.FIRECRAWL_API_KEY;
const targets = [
  { url: "https://pittsburghpanthers.com", search: "coach" },
  { url: "https://pittsburghpanthers.com", search: "staff" },
];

for (const t of targets) {
  console.log("\n=== map", t.url, "search:", t.search, "===");
  const res = await fetch("https://api.firecrawl.dev/v2/map", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: t.url, search: t.search, limit: 200 }),
  });
  const json = await res.json();
  console.log("status:", res.status, "success:", json.success, "links:", (json.links ?? json.data?.links ?? []).length);
  const links = json.links ?? json.data?.links ?? [];
  // Print a sample
  for (const link of links.slice(0, 60)) {
    const u = typeof link === "string" ? link : link.url;
    console.log(" ", u);
  }
  if (links.length > 60) console.log(`  ... ${links.length - 60} more`);

  // How many match our coach/staff regex
  const COACH_PATH_RE = /\/(coach(es|ing)?(-staff)?|staff(-directory)?|our-coaches|coaching-staff|directory|leadership|administration|athletic-staff|athletics?-staff)(\/|$|\?)/i;
  const matched = links.filter((l) => COACH_PATH_RE.test(typeof l === "string" ? l : l.url));
  console.log(`MATCHED by coach regex: ${matched.length}`);
  for (const m of matched.slice(0, 20)) console.log("  *", typeof m === "string" ? m : m.url);
}
