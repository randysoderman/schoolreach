-- School-level (organization) contact rows. These are NOT individual people
-- — they're the main contact channels for the school's front office, the
-- athletic department, and the booster club. Used for outreach where we
-- want to reach the institution rather than a specific coach/admin.
alter table schools
  add column admin_email text,
  add column admin_phone text,
  add column athletics_email text,
  add column athletics_phone text,
  add column booster_email text,
  add column booster_phone text,
  add column booster_url text;
