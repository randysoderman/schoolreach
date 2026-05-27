// Probe a single Sidearm coach page through Firecrawl + run our actual
// extractPeople prompt against it to see what's happening.

import "./_load-env.mjs";

const FIRECRAWL = process.env.FIRECRAWL_API_KEY;
const ANTHROPIC = process.env.ANTHROPIC_API_KEY;

const targets = [
  "https://pittsburghpanthers.com/sports/mens-soccer/coaches",
  "https://pittsburghpanthers.com/sports/womens-soccer/coaches",
  "https://pittsburghpanthers.com/sports/womens-lacrosse/coaches",
];

for (const url of targets) {
  console.log("\n=================================================");
  console.log("URL:", url);
  console.log("=================================================");

  const scrapeRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });
  const scrapeJson = await scrapeRes.json();
  const md = scrapeJson.data?.markdown ?? scrapeJson.markdown ?? "";
  console.log("scrape status:", scrapeRes.status, "markdown len:", md.length);
  console.log("--- first 2000 chars of markdown ---");
  console.log(md.slice(0, 2000).replace(/\n{3,}/g, "\n\n"));
  console.log("--- ... ---");

  if (md.length < 200) {
    console.log("(skipping extract — markdown too short)");
    continue;
  }

  // Run our actual extract prompt
  const prompt = `You are extracting people from a school staff or athletics directory.

Return JSON only, with this exact shape:
{
  "people": [ { "full_name": "string", "title": "string", "role_category": "coach|leader|staff", "confidence": 0.0 } ]
}

Rules:
- INCLUDE: head coaches, assistant coaches, athletic directors, deputy/associate ADs, athletic trainers, sport coordinators, chancellors, vice chancellors, deans.
- SKIP: students, alumni, donors, board members.

Source URL: ${url}

Page content:
"""
${md.slice(0, 30_000)}
"""`;

  const cRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const cJson = await cRes.json();
  const text = cJson.content?.[0]?.text ?? "(no text)";
  console.log("--- claude response (first 1500 chars) ---");
  console.log(text.slice(0, 1500));
}
