// Apply raw-SQL migrations from /supabase/migrations in lexical order.
// Tracks applied filenames in public._migrations. Idempotent.

import "./_load-env.mjs";
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const MIGRATIONS_DIR = "supabase/migrations";
const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  await sql`
    create table if not exists public._migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const applied = new Set(
    (await sql`select filename from public._migrations`).map((r) => r.filename),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`SKIP   ${file}`);
      continue;
    }
    const fullSql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`APPLY  ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(fullSql);
      await tx`insert into public._migrations (filename) values (${file})`;
    });
    appliedCount++;
  }

  console.log(`\nDone. ${appliedCount} migration(s) applied, ${applied.size} already present.`);
  await sql.end();
}

main().catch(async (err) => {
  console.error("Migration failed:", err.message);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
