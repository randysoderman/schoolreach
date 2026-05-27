-- Per-person social media profile links. Single JSONB column so we can add
-- platforms without further migrations; canonical keys are documented in
-- lib/social.ts.
alter table people
  add column social_profiles jsonb;

-- Partial index so "people with any social profile" filters are cheap.
create index people_has_social_idx on people ((social_profiles is not null))
  where social_profiles is not null;
