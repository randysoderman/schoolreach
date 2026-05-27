-- Reverse the earlier split between 'college' and 'university'. For outreach
-- purposes the distinction doesn't matter and the UI now shows a single
-- "College / University" option.
update schools set level = 'college' where level = 'university';

alter table schools drop constraint schools_level_check;
alter table schools
  add constraint schools_level_check
  check (level in ('elementary','middle','high','college','k12_combined'));
