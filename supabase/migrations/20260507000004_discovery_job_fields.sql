-- Track dry-run preview runs and surface errors on discovery_jobs.
alter table discovery_jobs
  add column dry_run boolean not null default false,
  add column error_message text;
