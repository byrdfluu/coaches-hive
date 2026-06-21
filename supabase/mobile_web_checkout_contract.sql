-- Canonical mobile/web checkout contract. Safe to run repeatedly.

create table if not exists public.mobile_checkout_handoffs (
  nonce uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checkout_type text not null check (checkout_type in ('fee', 'marketplace', 'onboarding')),
  resource_id uuid,
  status text not null default 'issued' check (status in ('issued', 'processing', 'consumed', 'fulfilled', 'expired')),
  stripe_checkout_session_id text unique,
  checkout_url text,
  metadata jsonb not null default '{}'::jsonb,
  token_expires_at timestamptz not null,
  expires_at timestamptz not null,
  fulfilled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mobile_checkout_handoffs_user_idx
  on public.mobile_checkout_handoffs(user_id, created_at desc);

alter table public.mobile_checkout_handoffs enable row level security;
drop policy if exists "mobile handoffs select own" on public.mobile_checkout_handoffs;
create policy "mobile handoffs select own" on public.mobile_checkout_handoffs
  for select using (user_id = auth.uid());

create table if not exists public.marketplace_items (
  id uuid primary key default gen_random_uuid(),
  seller_type text not null default 'coach' check (seller_type in ('coach', 'org')),
  coach_id uuid references public.profiles(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  name text not null default 'Marketplace item',
  description text,
  item_type text not null default 'physical' check (item_type in ('physical', 'digital')),
  price numeric(10,2) not null default 0 check (price >= 0),
  image_url text,
  purchase_url text,
  inventory_count integer check (inventory_count is null or inventory_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_items_one_seller check (
    (seller_type = 'coach' and coach_id is not null and org_id is null)
    or (seller_type = 'org' and org_id is not null and coach_id is null)
  )
);

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  coach_id uuid references public.profiles(id) on delete set null,
  item_id uuid references public.marketplace_items(id) on delete set null,
  buyer_id uuid references public.profiles(id) on delete set null,
  amount numeric(10,2) not null default 0,
  total_amount numeric(10,2),
  status text not null default 'paid',
  payment_status text not null default 'paid',
  fulfillment_status text not null default 'pending',
  delivery_status text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketplace_orders_checkout_session_unique
  on public.marketplace_orders(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create index if not exists marketplace_orders_buyer_created_idx on public.marketplace_orders(buyer_id, created_at desc);
create index if not exists marketplace_orders_coach_created_idx on public.marketplace_orders(coach_id, created_at desc);
create index if not exists marketplace_orders_org_created_idx on public.marketplace_orders(org_id, created_at desc);

alter table public.marketplace_items enable row level security;
alter table public.marketplace_orders enable row level security;

drop policy if exists "marketplace items readable" on public.marketplace_items;
create policy "marketplace items readable" on public.marketplace_items for select using (
  is_active or coach_id = auth.uid() or exists (
    select 1 from public.organization_memberships om
    where om.org_id = marketplace_items.org_id and om.user_id = auth.uid() and om.status = 'active'
  )
);
drop policy if exists "marketplace orders visible to participants" on public.marketplace_orders;
create policy "marketplace orders visible to participants" on public.marketplace_orders for select using (
  buyer_id = auth.uid() or coach_id = auth.uid() or exists (
    select 1 from public.organization_memberships om
    where om.org_id = marketplace_orders.org_id and om.user_id = auth.uid() and om.status = 'active'
  )
);

alter table if exists public.org_fee_assignments add column if not exists stripe_checkout_session_id text;
alter table if exists public.org_fee_assignments add column if not exists stripe_payment_intent_id text;
alter table if exists public.org_fee_assignments add column if not exists amount numeric(10,2);
alter table if exists public.org_fee_assignments add column if not exists updated_at timestamptz not null default now();
alter table if exists public.org_fees add column if not exists amount numeric(10,2);
alter table if exists public.org_fees add column if not exists amount_cents integer;
create table if not exists public.org_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  assignment_id uuid references public.org_fee_assignments(id) on delete set null,
  payer_id uuid references public.profiles(id) on delete set null,
  amount numeric(10,2) not null default 0,
  description text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'paid',
  created_at timestamptz not null default now()
);
alter table if exists public.org_payments add column if not exists stripe_checkout_session_id text;
alter table if exists public.org_payments add column if not exists stripe_payment_intent_id text;

create unique index if not exists org_payments_checkout_session_unique
  on public.org_payments(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create unique index if not exists org_payments_assignment_paid_unique
  on public.org_payments(assignment_id)
  where status = 'paid';

alter table if exists public.orders add column if not exists payment_intent_id text;
create unique index if not exists orders_payment_intent_unique
  on public.orders(payment_intent_id) where payment_intent_id is not null;

create or replace function public.complete_fee_payment(
  assignment_id uuid,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text default null,
  paid_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row public.org_fee_assignments%rowtype;
  fee_row public.org_fees%rowtype;
  payer_user_id uuid;
  expected_amount numeric;
  payment_id uuid;
begin
  select id into payment_id from public.org_payments
  where org_payments.stripe_checkout_session_id = complete_fee_payment.stripe_checkout_session_id;
  if payment_id is not null then return payment_id; end if;

  select * into assignment_row from public.org_fee_assignments where id = assignment_id for update;
  if not found then raise exception 'Fee assignment not found'; end if;
  select * into fee_row from public.org_fees where id = assignment_row.fee_id;
  if not found then raise exception 'Fee not found'; end if;

  expected_amount := coalesce(assignment_row.amount, fee_row.amount, fee_row.amount_cents / 100.0);
  if paid_amount is not null and round(paid_amount, 2) <> round(expected_amount, 2) then
    raise exception 'Paid amount does not match fee amount';
  end if;
  if assignment_row.status = 'paid' and assignment_row.stripe_checkout_session_id is distinct from complete_fee_payment.stripe_checkout_session_id then
    raise exception 'Fee assignment already paid by another checkout';
  end if;

  select owner_user_id into payer_user_id from public.athlete_profiles where id = assignment_row.athlete_id;
  payer_user_id := coalesce(payer_user_id, assignment_row.athlete_id);

  update public.org_fee_assignments set
    status = 'paid', paid_at = coalesce(paid_at, now()),
    stripe_checkout_session_id = complete_fee_payment.stripe_checkout_session_id,
    stripe_payment_intent_id = complete_fee_payment.stripe_payment_intent_id,
    updated_at = now()
  where id = assignment_id;

  insert into public.org_payments(
    org_id, assignment_id, payer_id, amount, description,
    stripe_checkout_session_id, stripe_payment_intent_id, status
  ) values (
    fee_row.org_id, assignment_id, payer_user_id, expected_amount, 'Fee payment',
    complete_fee_payment.stripe_checkout_session_id, complete_fee_payment.stripe_payment_intent_id, 'paid'
  )
  on conflict (assignment_id) where status = 'paid' do update set
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    stripe_payment_intent_id = excluded.stripe_payment_intent_id
  returning id into payment_id;
  return payment_id;
end;
$$;

create or replace function public.complete_marketplace_order(
  item_id uuid,
  buyer_id uuid,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text default null,
  paid_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_row public.marketplace_items%rowtype;
  order_id uuid;
begin
  select id into order_id from public.marketplace_orders
  where marketplace_orders.stripe_checkout_session_id = complete_marketplace_order.stripe_checkout_session_id;
  if order_id is not null then return order_id; end if;

  select * into item_row from public.marketplace_items where id = item_id and is_active = true for update;
  if not found then raise exception 'Marketplace item not found or inactive'; end if;
  if item_row.inventory_count is not null and item_row.inventory_count <= 0 then raise exception 'Marketplace item is out of stock'; end if;
  if paid_amount is not null and round(paid_amount, 2) <> round(item_row.price, 2) then
    raise exception 'Paid amount does not match marketplace item price';
  end if;

  insert into public.marketplace_orders(
    org_id, coach_id, item_id, buyer_id, amount, total_amount, status, payment_status,
    fulfillment_status, delivery_status, stripe_checkout_session_id, stripe_payment_intent_id, fulfilled_at
  ) values (
    item_row.org_id, item_row.coach_id, item_row.id, buyer_id, item_row.price, item_row.price,
    'paid', 'paid', case when item_row.item_type = 'digital' then 'delivered' else 'pending' end,
    case when item_row.item_type = 'digital' then 'delivered' else 'pending' end,
    complete_marketplace_order.stripe_checkout_session_id,
    complete_marketplace_order.stripe_payment_intent_id,
    case when item_row.item_type = 'digital' then now() else null end
  ) returning id into order_id;

  if item_row.inventory_count is not null then
    update public.marketplace_items set inventory_count = inventory_count - 1, updated_at = now() where id = item_row.id;
  end if;
  return order_id;
end;
$$;

revoke execute on function public.complete_fee_payment(uuid, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.complete_marketplace_order(uuid, uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.complete_fee_payment(uuid, text, text, numeric) to service_role;
grant execute on function public.complete_marketplace_order(uuid, uuid, text, text, numeric) to service_role;

-- Keep the established web products table and canonical mobile marketplace_items table synchronized.
create or replace function public.sync_product_to_marketplace_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare p jsonb;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    update public.marketplace_items set is_active = false, updated_at = now() where id = old.id;
    return old;
  end if;
  p := to_jsonb(new);
  if coalesce(p->>'coach_id', p->>'org_id', '') = '' then return new; end if;
  insert into public.marketplace_items(
    id, seller_type, coach_id, org_id, name, description, item_type, price,
    image_url, inventory_count, is_active, created_at, updated_at
  ) values (
    new.id,
    case when nullif(p->>'coach_id', '') is not null then 'coach' else 'org' end,
    nullif(p->>'coach_id', '')::uuid,
    nullif(p->>'org_id', '')::uuid,
    coalesce(nullif(p->>'title', ''), nullif(p->>'name', ''), 'Marketplace item'),
    nullif(p->>'description', ''),
    case when lower(coalesce(p->>'format', p->>'type', '')) like '%digital%' then 'digital' else 'physical' end,
    coalesce(nullif(p->>'sale_price', '')::numeric, nullif(p->>'price', '')::numeric, nullif(p->>'price_cents', '')::numeric / 100.0, 0),
    nullif(p->>'media_url', ''),
    nullif(p->>'inventory_count', '')::integer,
    lower(coalesce(p->>'status', 'draft')) = 'published',
    coalesce((p->>'created_at')::timestamptz, now()), now()
  ) on conflict (id) do update set
    seller_type = excluded.seller_type, coach_id = excluded.coach_id, org_id = excluded.org_id,
    name = excluded.name, description = excluded.description, item_type = excluded.item_type,
    price = excluded.price, image_url = excluded.image_url, inventory_count = excluded.inventory_count,
    is_active = excluded.is_active, updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_sync_marketplace_items on public.products;
create trigger products_sync_marketplace_items after insert or update or delete on public.products
for each row execute function public.sync_product_to_marketplace_item();

create or replace function public.sync_marketplace_item_to_product()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    update public.products set status = 'draft' where id = old.id;
    return old;
  end if;
  insert into public.products(
    id, title, type, category, format, status, price, description,
    coach_id, org_id, media_url, inventory_count, created_at, updated_at
  ) values (
    new.id,
    new.name,
    new.item_type,
    case when new.item_type = 'digital' then 'Digital product' else 'Physical product' end,
    new.item_type, case when new.is_active then 'published' else 'draft' end,
    new.price, new.description, new.coach_id, new.org_id, new.image_url,
    new.inventory_count, new.created_at, new.updated_at
  ) on conflict (id) do update set
    title = excluded.title, type = excluded.type, category = excluded.category,
    format = excluded.format, status = excluded.status, price = excluded.price,
    description = excluded.description, coach_id = excluded.coach_id, org_id = excluded.org_id,
    media_url = excluded.media_url, inventory_count = excluded.inventory_count, updated_at = now();
  return new;
end;
$$;

drop trigger if exists marketplace_items_sync_products on public.marketplace_items;
create trigger marketplace_items_sync_products after insert or update or delete on public.marketplace_items
for each row execute function public.sync_marketplace_item_to_product();

-- Backfill existing web listings into the canonical marketplace table.
insert into public.marketplace_items(id, seller_type, coach_id, org_id, name, description, item_type, price, image_url, inventory_count, is_active, created_at, updated_at)
select p.id,
  case when nullif(to_jsonb(p)->>'coach_id', '') is not null then 'coach' else 'org' end,
  nullif(to_jsonb(p)->>'coach_id', '')::uuid,
  nullif(to_jsonb(p)->>'org_id', '')::uuid,
  coalesce(nullif(to_jsonb(p)->>'title', ''), nullif(to_jsonb(p)->>'name', ''), 'Marketplace item'),
  nullif(to_jsonb(p)->>'description', ''),
  case when lower(coalesce(to_jsonb(p)->>'format', to_jsonb(p)->>'type', '')) like '%digital%' then 'digital' else 'physical' end,
  coalesce(
    nullif(to_jsonb(p)->>'sale_price', '')::numeric,
    nullif(to_jsonb(p)->>'price', '')::numeric,
    nullif(to_jsonb(p)->>'price_cents', '')::numeric / 100.0,
    0
  ),
  nullif(to_jsonb(p)->>'media_url', ''),
  nullif(to_jsonb(p)->>'inventory_count', '')::integer,
  lower(coalesce(to_jsonb(p)->>'status', 'draft')) = 'published',
  coalesce(nullif(to_jsonb(p)->>'created_at', '')::timestamptz, now()),
  coalesce(nullif(to_jsonb(p)->>'updated_at', '')::timestamptz, now())
from public.products p
where nullif(to_jsonb(p)->>'coach_id', '') is not null
   or nullif(to_jsonb(p)->>'org_id', '') is not null
on conflict (id) do nothing;
