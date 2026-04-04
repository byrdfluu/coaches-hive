alter table if exists public.profiles
  add column if not exists coach_privacy_settings jsonb
  default jsonb_build_object(
    'visibleToAthletes', true,
    'allowDirectMessages', true,
    'showProgressSnapshots', true,
    'showRatings', true,
    'blockedAthletes', '',
    'regionVisibility', ''
  );
