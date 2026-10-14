begin;

alter table public.programs
  add column if not exists eligible_grades text[] not null default '{}';

comment on column public.programs.eligible_grades is
  'Optional organization-authored grade labels used by the unified offering wizard.';

commit;
