create table if not exists public.admin_configs (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists admin_configs_updated_at_idx on public.admin_configs(updated_at desc);
