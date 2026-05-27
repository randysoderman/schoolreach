import "./_load-env.mjs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const jobs = await sql`
    select sj.id, sj.status, sj.stage, sj.pages_fetched, sj.people_found,
           sj.error_message, sj.started_at, sj.completed_at,
           s.name as school_name, s.website_url, s.staff_directory_url, s.athletics_url
    from scrape_jobs sj
    left join schools s on sj.school_id = s.id
    order by sj.created_at desc
    limit 5
  `;
  for (const j of jobs) {
    console.log("---");
    console.log(`school:               ${j.school_name}`);
    console.log(`website_url:          ${j.website_url ?? "(null)"}`);
    console.log(`staff_directory_url:  ${j.staff_directory_url ?? "(null)"}`);
    console.log(`athletics_url:        ${j.athletics_url ?? "(null)"}`);
    console.log(`status / stage:       ${j.status} / ${j.stage}`);
    console.log(`pages / people:       ${j.pages_fetched} / ${j.people_found}`);
    console.log(`started / completed:  ${j.started_at} / ${j.completed_at}`);
    console.log(`error_message:        ${j.error_message ?? "(none)"}`);
  }
} finally {
  await sql.end();
}
