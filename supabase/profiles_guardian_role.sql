alter table if exists public.profiles
  drop constraint if exists profiles_role_check;

alter table if exists public.profiles
  add constraint profiles_role_check
  check (
    role in (
      'coach',
      'assistant_coach',
      'athlete',
      'guardian',
      'org_admin',
      'club_admin',
      'travel_admin',
      'school_admin',
      'athletic_director',
      'program_director',
      'team_manager',
      'admin',
      'superadmin',
      'support',
      'finance',
      'ops'
    )
  );
