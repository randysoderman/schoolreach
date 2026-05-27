import "./_load-env.mjs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const rows = await sql`
    select full_name, title, role_category, coach_role, team_gender, sport,
           email, phone, social_profiles, confidence_score, bio_url
    from people
    where school_id = (select id from schools where nces_id = 'TEST-0001')
    order by role_category, full_name
  `;
  console.log(`${rows.length} people on Lincoln HS:\n`);
  for (const p of rows) {
    const socials = p.social_profiles
      ? Object.entries(p.social_profiles).filter(([, v]) => v).map(([k]) => k).join(",")
      : "—";
    console.log(`  ${p.full_name.padEnd(25)} | ${(p.title ?? "—").padEnd(40)} | ${p.role_category.padEnd(7)} | conf=${p.confidence_score} | email=${p.email ?? "(none)"} | sport=${p.sport ?? "—"} | socials=${socials || "—"}`);
  }
  console.log("\nBreakdowns:");
  const byRole = {};
  for (const p of rows) byRole[p.role_category] = (byRole[p.role_category] ?? 0) + 1;
  console.log("  by role_category:", byRole);
  const withEmail = rows.filter(p => p.email).length;
  console.log(`  with email: ${withEmail} / ${rows.length}`);
  const withSocial = rows.filter(p => p.social_profiles && Object.values(p.social_profiles).some(Boolean)).length;
  console.log(`  with any social: ${withSocial} / ${rows.length}`);
} finally {
  await sql.end();
}
