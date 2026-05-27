// Mark any "running" scrape jobs as failed so retries stop.
// Use carefully — only run this when you know a scrape is genuinely stuck.

import "./_load-env.mjs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const updated = await sql`
    update scrape_jobs
    set status = 'failed',
        error_message = 'Manually cancelled: stuck during retry loop',
        completed_at = now()
    where status in ('queued', 'running')
    returning id, school_id
  `;
  console.log(`Cancelled ${updated.length} job(s):`);
  for (const u of updated) console.log(" ", u.id, "school:", u.school_id);

  // Also reset the parent schools' status from running to failed.
  if (updated.length) {
    const schoolIds = updated.map((u) => u.school_id);
    await sql`
      update schools set scrape_status = 'failed'
      where id in ${sql(schoolIds)} and scrape_status = 'running'
    `;
    console.log("Reset parent schools.scrape_status -> failed");
  }
} finally {
  await sql.end();
}
