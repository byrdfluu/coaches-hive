alter table if exists public.profiles
  add column if not exists coach_security_settings jsonb
  default jsonb_build_object(
    'twoFactorMethod', 'off',
    'passkeys', '[]'::jsonb
  );
