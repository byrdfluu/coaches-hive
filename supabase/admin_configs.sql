create table if not exists public.admin_configs (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists admin_configs_updated_at_idx on public.admin_configs(updated_at desc);

insert into public.admin_configs (key, data)
values (
  'fee_settings',
  '{
    "stripeProcessingFeePercent": 2.9,
    "stripeProcessingFeeFixedCents": 30,
    "programPlatformFeePercent": 7,
    "orgFeePlatformFeePercent": 2.9,
    "marketplacePlatformFeePercent": 10,
    "marketplacePlatformFeeCapCents": 7500,
    "orgSessionRollingVolumeWindowDays": 30,
    "orgSessionRollingVolumeTiers": [
      { "minimumVolumeCents": 0, "feePercent": 10 },
      { "minimumVolumeCents": 2500000, "feePercent": 7 },
      { "minimumVolumeCents": 10000000, "feePercent": 5 }
    ]
  }'::jsonb
)
on conflict (key) do nothing;
