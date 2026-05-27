// Reset test school to a clean slate so a re-scrape exercises every step.

import "./_load-env.mjs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const [row] = await sql`
    update schools
    set website_url = null,
        staff_directory_url = null,
        athletics_url = null,
        scrape_status = 'pending',
        last_scraped_at = null
    where nces_id = 'TEST-0001'
    returning id, name, scrape_status
  `;
  console.log("Reset:", row);
} finally {
  await sql.end();
}
