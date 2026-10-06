begin;

-- Authoritative mobile messaging stores the participant's conversation
-- identity, while older web messaging only allowed coach/athlete/admin. Keep
-- those legacy values and add the semantic roles already emitted by the
-- server-side thread RPCs.
alter table public.thread_participants
  drop constraint if exists thread_participants_role_check;

alter table public.thread_participants
  add constraint thread_participants_role_check check (
    role in (
      'coach',
      'athlete',
      'admin',
      'family',
      'guardian',
      'parent_athlete',
      'organization',
      'organization_contact',
      'program_director',
      'user'
    )
  );

notify pgrst,'reload schema';
commit;
