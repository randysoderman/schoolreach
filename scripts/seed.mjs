// One-shot seed: insert a single test school. Idempotent on nces_id.

import "./_load-env.mjs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

// Note: website_url intentionally null. The scrape pipeline's find_website
// step (Brave Search) will resolve and persist the real URL on first run.
const TEST_SCHOOL = {
  nces_id: "TEST-0001",
  name: "Lincoln High School (Test)",
  level: "high",
  state: "WA",
  city: "Tacoma",
  district: "Tacoma Public Schools",
  street_address: "701 S 37th St",
  zip: "98418",
  website_url: null,
  source: "manual",
};

try {
  const [row] = await sql`
    insert into schools ${sql(TEST_SCHOOL)}
    on conflict (nces_id) do update set
      name           = excluded.name,
      level          = excluded.level,
      state          = excluded.state,
      city           = excluded.city,
      district       = excluded.district,
      street_address = excluded.street_address,
      zip            = excluded.zip,
      source         = excluded.source
      -- website_url is preserved so Brave-resolved URL survives re-seeding
    returning id, name, state, level, scrape_status, created_at
  `;
  console.log("Seeded test school:");
  console.log(`  id            ${row.id}`);
  console.log(`  name          ${row.name}`);
  console.log(`  state/level   ${row.state} / ${row.level}`);
  console.log(`  scrape_status ${row.scrape_status}`);
  console.log(`  created_at    ${row.created_at.toISOString()}`);

  // Seed a handful of people on the test school so list/detail pages have data.
  const samplePeople = [
    {
      full_name: "Pat Rivera",
      first_name: "Pat",
      last_name: "Rivera",
      title: "Head Football Coach",
      role_category: "coach",
      coach_role: "head_coach",
      team_gender: "mens",
      sport: "Football",
      email: "p.rivera@example.com",
      confidence_score: "0.92",
      email_status: "valid",
    },
    {
      full_name: "Jordan Lee",
      first_name: "Jordan",
      last_name: "Lee",
      title: "Athletic Director",
      role_category: "leader",
      coach_role: null,
      team_gender: null,
      sport: null,
      email: "jlee@example.com",
      confidence_score: "0.97",
      email_status: "valid",
    },
    {
      full_name: "Sam Patel",
      first_name: "Sam",
      last_name: "Patel",
      title: "Head Girls Basketball Coach",
      role_category: "coach",
      coach_role: "head_coach",
      team_gender: "womens",
      sport: "Basketball",
      email: null,
      confidence_score: "0.78",
      email_status: "unknown",
    },
    {
      full_name: "Chris Nguyen",
      first_name: "Chris",
      last_name: "Nguyen",
      title: "Assistant Football Coach",
      role_category: "coach",
      coach_role: "assistant_coach",
      team_gender: "mens",
      sport: "Football",
      email: "cnguyen@example.com",
      confidence_score: "0.85",
      email_status: "valid",
    },
  ];

  for (const person of samplePeople) {
    await sql`
      insert into people ${sql({ school_id: row.id, ...person })}
      on conflict (school_id, full_name, title) do update set
        first_name       = excluded.first_name,
        last_name        = excluded.last_name,
        role_category    = excluded.role_category,
        coach_role       = excluded.coach_role,
        team_gender      = excluded.team_gender,
        sport            = excluded.sport,
        email            = excluded.email,
        confidence_score = excluded.confidence_score,
        email_status     = excluded.email_status
    `;
  }

  const [{ count }] = await sql`select count(*)::int as count from schools`;
  const [{ pcount }] = await sql`select count(*)::int as pcount from people`;
  console.log(`\nTotal schools: ${count}, total people: ${pcount}`);
} catch (err) {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
