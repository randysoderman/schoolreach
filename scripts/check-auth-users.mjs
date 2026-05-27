// Diagnostic: list users in auth.users and recent auth audit events.

import "./_load-env.mjs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const users = await sql`
    select id, email, email_confirmed_at, last_sign_in_at, created_at
    from auth.users
    order by created_at desc
  `;
  console.log(`auth.users: ${users.length} row(s)\n`);
  if (users.length === 0) {
    console.log("  (no users — magic-link signin will silently no-op since shouldCreateUser=false)");
  } else {
    for (const u of users) {
      console.log(`  email:              ${u.email}`);
      console.log(`  id:                 ${u.id}`);
      console.log(`  email_confirmed_at: ${u.email_confirmed_at ?? "(null — NOT confirmed)"}`);
      console.log(`  last_sign_in_at:    ${u.last_sign_in_at ?? "(never)"}`);
      console.log(`  created_at:         ${u.created_at}`);
      console.log("");
    }
  }

  console.log("\nRecent auth events (last 10):");
  const events = await sql`
    select created_at, payload->>'action' as action, payload->'actor_username' as actor, payload->>'log_type' as log_type
    from auth.audit_log_entries
    order by created_at desc
    limit 10
  `;
  if (events.length === 0) {
    console.log("  (no audit log entries)");
  } else {
    for (const e of events) {
      console.log(`  ${e.created_at}  ${e.log_type ?? ""}  ${e.action ?? ""}  ${e.actor ?? ""}`);
    }
  }
} catch (err) {
  console.error("Diag failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
