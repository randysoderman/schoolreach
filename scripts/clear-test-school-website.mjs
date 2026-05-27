// One-shot: null out the test school's bogus website URL so the scrape
// pipeline exercises its find_website (Brave) step.

import "./_load-env.mjs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const [row] = await sql`
    update schools
    set website_url = null,
        scrape_status = 'pending',
        last_scraped_at = null
    where nces_id = 'TEST-0001'
    returning id, name, website_url, scrape_status
  `;
  if (row) {
    console.log("Cleared:", row);
  } else {
    console.log("No row matched nces_id=TEST-0001");
  }
} finally {
  await sql.end();
}
