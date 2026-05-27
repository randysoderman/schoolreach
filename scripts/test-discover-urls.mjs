// What list-pages would discover-coach-pages actually find for Pitt?
// Probe with the same regex our scrape uses.

import "./_load-env.mjs";

const apiKey = process.env.FIRECRAWL_API_KEY;
const seedRoots = [
  "https://pittsburghpanthers.com",
  "https://www.pitt.edu/about/leadership",
];

const LIST_PATH_RE = /\/(coach(es|ing)?(-staff)?|staff(-directory)?|our-coaches|coaching-staff|directory|leadership|administration|athletic-staff|athletics?-staff)\/?(\?.*)?$/i;
const SPORT_SLUG_RE = /\/sports\/([a-z0-9][a-z0-9-]+)(?:\/|$)/i;

function sameHost(a, b) {
  try { return new URL(a).hostname === new URL(b).hostname; } catch { return false; }
}

const seen = new Set(seedRoots);
const out = [];

for (const root of seedRoots) {
  const allLinks = new Set();
  for (const search of ["coach", "staff"]) {
    const res = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: root, search, limit: 500 }),
    });
    const json = await res.json();
    const links = (json.links ?? []).map((l) => (typeof l === "string" ? l : l.url));
    console.log(`map ${root} search=${search} → ${links.length} links`);
    for (const link of links) {
      if (sameHost(link, root)) allLinks.add(link);
    }
  }

  let listAdded = 0;
  for (const link of allLinks) {
    if (seen.has(link)) continue;
    if (LIST_PATH_RE.test(link)) {
      seen.add(link);
      out.push(link);
      listAdded++;
    }
  }
  console.log(`  list pages added: ${listAdded}`);

  const slugs = new Set();
  for (const link of allLinks) {
    const m = link.match(SPORT_SLUG_RE);
    if (m) slugs.add(m[1].toLowerCase());
  }
  console.log(`  unique sport slugs: ${slugs.size} → [${[...slugs].join(", ")}]`);
  let synthAdded = 0;
  const rootOrigin = new URL(root).origin;
  for (const slug of slugs) {
    const synth = `${rootOrigin}/sports/${slug}/coaches`;
    if (seen.has(synth)) continue;
    seen.add(synth);
    out.push(synth);
    synthAdded++;
  }
  console.log(`  synthesized sport-coach urls: ${synthAdded}`);
}

console.log(`\nTotal discovered: ${out.length}`);
for (const u of out) console.log(" ", u);
