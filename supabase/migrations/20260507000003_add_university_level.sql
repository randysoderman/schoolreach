-- Allow 'university' as a school level (separate from 'college').
alter table schools drop constraint schools_level_check;
alter table schools
  add constraint schools_level_check
  check (level in ('elementary','middle','high','college','university','k12_combined'));
