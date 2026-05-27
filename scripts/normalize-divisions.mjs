// One-shot: canonicalize all existing schools.division values to short codes
// (D1/D2/D3/NAIA/JUCO/HS). Idempotent — running it twice does nothing.

import "./_load-env.mjs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

function canonicalize(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();

  if (/ncaa\s*d(ivision)?\s*[1i]\b/.test(key)) return "D1";
  if (/^d[\-\s]?(1|i)$/.test(key)) return "D1";
  if (/division\s*[1i]\b/.test(key)) return "D1";

  if (/ncaa\s*d(ivision)?\s*(2|ii)\b/.test(key)) return "D2";
  if (/^d[\-\s]?(2|ii)$/.test(key)) return "D2";
  if (/division\s*(2|ii)\b/.test(key)) return "D2";

  if (/ncaa\s*d(ivision)?\s*(3|iii)\b/.test(key)) return "D3";
  if (/^d[\-\s]?(3|iii)$/.test(key)) return "D3";
  if (/division\s*(3|iii)\b/.test(key)) return "D3";

  if (/\bnaia\b/.test(key)) return "NAIA";
  if (/\bnjcaa\b|\bjuco\b/.test(key)) return "JUCO";
  if (/\buscaa\b/.test(key)) return "USCAA";
  if (/\bcccaa\b/.test(key)) return "CCCAA";
  if (/\bnwac\b/.test(key)) return "NWAC";

  return trimmed; // leave unfamiliar values alone
}

try {
  const rows = await sql`
    select id, division from schools where division is not null
  `;
  let changed = 0;
  for (const r of rows) {
    const canonical = canonicalize(r.division);
    if (canonical && canonical !== r.division) {
      await sql`update schools set division = ${canonical} where id = ${r.id}`;
      changed++;
    }
  }
  console.log(`Examined ${rows.length} rows, updated ${changed}.`);
} finally {
  await sql.end();
}
