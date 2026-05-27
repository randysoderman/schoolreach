// What sports & roles did we get for a given school?
import "./_load-env.mjs";
import postgres from "postgres";

const q = process.argv[2] || "Pittsburgh-Pittsburgh";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const [school] = await sql`
    select id, name, scrape_status, last_scraped_at, conference, division
    from schools where name ilike ${"%" + q + "%"} limit 1
  `;
  if (!school) {
    console.log("no match");
    process.exit(0);
  }
  console.log("School:", school.name);
  console.log("Status:", school.scrape_status, "Conference:", school.conference, "Division:", school.division);
  console.log("Last scrape:", school.last_scraped_at);

  const [{ c }] = await sql`select count(*)::int c from people where school_id = ${school.id}`;
  console.log(`\nTotal people: ${c}`);

  const sports = await sql`
    select sport, count(*)::int as n
    from people where school_id = ${school.id} and sport is not null
    group by sport order by sport
  `;
  console.log("\nBy sport:");
  for (const s of sports) console.log(`  ${s.sport.padEnd(30)} ${s.n}`);

  const roles = await sql`
    select role_category, coach_role, count(*)::int as n
    from people where school_id = ${school.id}
    group by role_category, coach_role order by role_category, coach_role
  `;
  console.log("\nBy role:");
  for (const r of roles) console.log(`  ${r.role_category}/${r.coach_role ?? "—"} : ${r.n}`);

  const jobs = await sql`
    select status, stage, pages_fetched, people_found, started_at, completed_at, error_message
    from scrape_jobs where school_id = ${school.id} order by created_at desc limit 3
  `;
  console.log("\nRecent jobs:");
  for (const j of jobs) {
    const dur = j.completed_at && j.started_at
      ? Math.round((new Date(j.completed_at) - new Date(j.started_at)) / 1000) + "s"
      : "—";
    console.log(`  [${j.status}/${j.stage}] pages=${j.pages_fetched} people=${j.people_found} dur=${dur} err=${j.error_message ?? "—"}`);
  }
} finally {
  await sql.end();
}
