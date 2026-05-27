-- Cache LLM extraction results keyed on (url, content_hash). When the same
-- URL is re-scraped and the markdown hash matches a previous cache entry,
-- we reuse the cached people-array and skip the LLM call entirely. Cuts
-- the cost of re-scraping unchanged schools to near-zero.
create table extract_cache (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  content_hash text not null,
  people_json jsonb not null,
  llm_provider text not null,           -- 'anthropic' | 'gemini'
  hit_count int not null default 0,     -- bumped on each reuse
  created_at timestamptz default now(),
  last_used_at timestamptz default now()
);
create unique index extract_cache_url_hash_idx on extract_cache (url, content_hash);
create index extract_cache_last_used_idx on extract_cache (last_used_at);

alter table extract_cache enable row level security;
create policy "authenticated all access" on extract_cache for all to authenticated using (true) with check (true);
