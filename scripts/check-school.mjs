// Diagnostic: dump a school's state + recent scrape jobs by name match.
// Usage: node scripts/check-school.mjs "<name fragment>"

import "./_load-env.mjs";
import postgres from "postgres";

const q = process.argv[2] || "Pittsburgh";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const schools = await sql`
    select id, name, level, state, website_url, staff_directory_url,
           athletics_url, conference, division, scrape_status, last_scraped_at
    from schools
    where name ilike ${"%" + q + "%"}
    order by name
    limit 5
  `;
  for (const s of schools) {
    console.log("===", s.name, "===");
    for (const [k, v] of Object.entries(s)) {
      if (k === "name") continue;
      console.log(` ${k}: ${v ?? "(null)"}`);
    }
    const jobs = await sql`
      select status, stage, pages_fetched, people_found, error_message,
             started_at, completed_at
      from scrape_jobs
      where school_id = ${s.id}
      order by created_at desc
      limit 3
    `;
    console.log(`  recent jobs (${jobs.length}):`);
    for (const j of jobs) {
      console.log(`    [${j.status}/${j.stage}] pages=${j.pages_fetched} people=${j.people_found} err=${j.error_message ?? "—"}`);
    }
    const peopleCount = await sql`select count(*)::int as c from people where school_id = ${s.id}`;
    console.log(`  total people in DB: ${peopleCount[0].c}`);
    console.log("");
  }
} finally {
  await sql.end();
}
