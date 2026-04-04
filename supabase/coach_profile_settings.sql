alter table if exists public.profiles
  add column if not exists coach_profile_settings jsonb
  default jsonb_build_object(
    'title', '',
    'location', '',
    'primarySport', '',
    'rates', jsonb_build_object(
      'oneOnOne', '',
      'team', '',
      'group', '',
      'virtual', '',
      'assessment', ''
    ),
    'certification', jsonb_build_object(
      'name', '',
      'organization', '',
      'date', '',
      'fileUrl', ''
    ),
    'media', '[]'::jsonb
  );
