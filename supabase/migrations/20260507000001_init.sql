-- Initial schema for SchoolReach.
-- Tables, indexes, updated_at trigger, RLS policies for authenticated users.

create extension if not exists pgcrypto;

-- updated_at trigger function (used by tables that have an updated_at column)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ==========================================================================
-- schools
-- ==========================================================================
create table schools (
  id uuid primary key default gen_random_uuid(),
  nces_id text unique,
  name text not null,
  level text not null check (level in ('elementary','middle','high','college','k12_combined')),
  state text not null,
  city text,
  district text,
  street_address text,
  zip text,
  website_url text,
  athletics_url text,
  staff_directory_url text,
  enrollment int,
  conference text,
  division text,
  source text not null,
  last_scraped_at timestamptz,
  scrape_status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index schools_state_level_idx on schools (state, level);
create index schools_scrape_status_idx on schools (scrape_status);

create trigger schools_set_updated_at
  before update on schools
  for each row execute function public.set_updated_at();

-- ==========================================================================
-- people
-- ==========================================================================
create table people (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  full_name text not null,
  first_name text,
  last_name text,
  title text,
  role_category text not null,
  sport text,
  email text,
  phone text,
  bio_url text,
  photo_url text,
  source_url text,
  confidence_score numeric(3,2),
  verified boolean default false,
  email_status text default 'unknown',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index people_school_name_title_idx on people (school_id, full_name, title);
create index people_role_sport_idx on people (role_category, sport);
create index people_email_idx on people (email) where email is not null;

create trigger people_set_updated_at
  before update on people
  for each row execute function public.set_updated_at();

-- ==========================================================================
-- scrape_jobs
-- ==========================================================================
create table scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  inngest_run_id text,
  status text not null,
  stage text,
  pages_fetched int default 0,
  people_found int default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- ==========================================================================
-- discovery_jobs
-- ==========================================================================
create table discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  levels text[] not null,
  status text not null,
  schools_discovered int default 0,
  schools_enqueued int default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- ==========================================================================
-- campaigns
-- ==========================================================================
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body_html text not null,
  body_text text not null,
  from_name text not null,
  from_email text not null,
  reply_to text,
  status text default 'draft',
  scheduled_at timestamptz,
  send_rate_per_hour int default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger campaigns_set_updated_at
  before update on campaigns
  for each row execute function public.set_updated_at();

-- ==========================================================================
-- campaign_recipients
-- ==========================================================================
create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  status text default 'queued',
  resend_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  error_message text,
  created_at timestamptz default now()
);
create unique index campaign_recipients_campaign_person_idx
  on campaign_recipients (campaign_id, person_id);
create index campaign_recipients_status_idx on campaign_recipients (status);

-- ==========================================================================
-- segments
-- ==========================================================================
create table segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filters jsonb not null,
  created_at timestamptz default now()
);

-- ==========================================================================
-- suppressions
-- ==========================================================================
create table suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null,
  created_at timestamptz default now()
);

-- ==========================================================================
-- Row Level Security
-- Single-tenant: authenticated users can do everything. Service role bypasses
-- RLS automatically. No public/anonymous access.
-- ==========================================================================
alter table schools             enable row level security;
alter table people              enable row level security;
alter table scrape_jobs         enable row level security;
alter table discovery_jobs      enable row level security;
alter table campaigns           enable row level security;
alter table campaign_recipients enable row level security;
alter table segments            enable row level security;
alter table suppressions        enable row level security;

create policy "authenticated all access" on schools             for all to authenticated using (true) with check (true);
create policy "authenticated all access" on people              for all to authenticated using (true) with check (true);
create policy "authenticated all access" on scrape_jobs         for all to authenticated using (true) with check (true);
create policy "authenticated all access" on discovery_jobs      for all to authenticated using (true) with check (true);
create policy "authenticated all access" on campaigns           for all to authenticated using (true) with check (true);
create policy "authenticated all access" on campaign_recipients for all to authenticated using (true) with check (true);
create policy "authenticated all access" on segments            for all to authenticated using (true) with check (true);
create policy "authenticated all access" on suppressions        for all to authenticated using (true) with check (true);
