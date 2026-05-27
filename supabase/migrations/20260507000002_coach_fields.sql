-- Add structured fields for filtering coaches by seniority and team gender.
-- coach_role:  head_coach | assistant_head_coach | assistant_coach | (free)
-- team_gender: mens | womens | coed
-- Both nullable. Only meaningful when role_category = 'coach'.

alter table people
  add column coach_role text,
  add column team_gender text;

-- No check constraint on coach_role: titles vary widely; we treat the listed
-- values as canonical but allow others. Filtering is exact-match.
alter table people
  add constraint people_team_gender_check
  check (team_gender is null or team_gender in ('mens','womens','coed'));

create index people_coach_role_idx on people (coach_role) where coach_role is not null;
create index people_team_gender_idx on people (team_gender) where team_gender is not null;
