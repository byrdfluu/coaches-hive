-- Backend-authoritative fee configuration for mobile program registrations
-- and organization dues. Existing customized fee settings are preserved.

insert into public.admin_configs (key, data)
values (
  'fee_settings',
  jsonb_build_object(
    'stripeProcessingFeePercent', 2.9,
    'stripeProcessingFeeFixedCents', 30,
    'programPlatformFeePercent', 7,
    'orgFeePlatformFeePercent', 2.9,
    'marketplacePlatformFeePercent', 10,
    'marketplacePlatformFeeCapCents', 7500,
    'orgSessionRollingVolumeWindowDays', 30,
    'orgSessionRollingVolumeTiers', jsonb_build_array(
      jsonb_build_object('minimumVolumeCents', 0, 'feePercent', 7),
      jsonb_build_object('minimumVolumeCents', 2500000, 'feePercent', 5)
    )
  )
)
on conflict (key) do update
set data = coalesce(public.admin_configs.data, '{}'::jsonb)
  || jsonb_build_object(
    'programPlatformFeePercent', coalesce(
      public.admin_configs.data -> 'programPlatformFeePercent',
      to_jsonb(7)
    ),
    'orgFeePlatformFeePercent', coalesce(
      public.admin_configs.data -> 'orgFeePlatformFeePercent',
      to_jsonb(2.9)
    )
  ),
  updated_at = now();
