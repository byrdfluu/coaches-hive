begin;

create table if not exists public.org_training_multi_checkout_attempts(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  athlete_id uuid not null references public.athlete_profiles(id) on delete restrict,
  payer_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'pending' check(status in('pending','checkout_pending','processing','succeeded','expired','cancelled','refunded','partially_refunded')),
  base_amount_cents integer not null check(base_amount_cents>=0),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(payer_user_id,idempotency_key)
);
create table if not exists public.org_training_multi_checkout_occurrences(
  attempt_id uuid not null references public.org_training_multi_checkout_attempts(id) on delete cascade,
  session_id uuid not null references public.org_training_sessions(id) on delete restrict,
  amount_cents integer not null check(amount_cents>=0),
  booking_id uuid references public.org_training_session_bookings(id) on delete restrict,
  status text not null default 'held' check(status in('held','confirmed','cancelled','refunded')),
  primary key(attempt_id,session_id)
);
create index if not exists org_training_checkout_active_session_idx on public.org_training_multi_checkout_occurrences(session_id,status);
alter table public.org_training_multi_checkout_attempts enable row level security;
alter table public.org_training_multi_checkout_occurrences enable row level security;
revoke all on public.org_training_multi_checkout_attempts,public.org_training_multi_checkout_occurrences from public,anon,authenticated;
grant all on public.org_training_multi_checkout_attempts,public.org_training_multi_checkout_occurrences to service_role;

create or replace function public.prepare_org_training_multi_checkout(p_payer uuid,p_athlete uuid,p_sessions uuid[],p_key uuid)
returns table(attempt_id uuid,org_id uuid,base_amount_cents integer,status text) language plpgsql security definer set search_path=public as $$
declare a public.org_training_multi_checkout_attempts%rowtype;o uuid;total integer;requested integer;
begin
 if p_payer is null or p_athlete is null or p_key is null or cardinality(p_sessions) is null or cardinality(p_sessions)=0 or cardinality(p_sessions)>20 then raise exception'multi_checkout_invalid';end if;
 if cardinality(p_sessions)<>cardinality(array(select distinct x from unnest(p_sessions)x))then raise exception'duplicate_occurrence';end if;
 if not exists(select 1 from athlete_profiles ap where ap.id=p_athlete and ap.status='active'and coalesce(ap.is_test,false)=false and(ap.owner_user_id=p_payer or ap.auth_user_id=p_payer or exists(select 1 from family_subscription_athletes f where f.athlete_profile_id=ap.id and f.subscription_owner_id=p_payer)))then raise exception'athlete_unavailable';end if;
 select*into a from org_training_multi_checkout_attempts where payer_user_id=p_payer and idempotency_key=p_key;
 if found then return query select a.id,a.org_id,a.base_amount_cents,a.status;return;end if;
 perform 1 from org_training_sessions s where s.id=any(p_sessions) order by s.id for update;
 select count(*),min(s.org_id),sum(s.drop_in_price_cents)::integer into requested,o,total from org_training_sessions s where s.id=any(p_sessions)and s.status='published'and s.starts_at>now();
 if requested<>cardinality(p_sessions)then raise exception'occurrence_unavailable';end if;
 if exists(select 1 from org_training_sessions s where s.id=any(p_sessions)and s.org_id<>o)then raise exception'mixed_organizations';end if;
 if exists(select 1 from org_training_sessions s where s.id=any(p_sessions)and(
   exists(select 1 from org_training_session_bookings b where b.session_id=s.id and b.athlete_id=p_athlete and b.status in('pending_payment','reserved','attended','no_show'))or
   s.capacity<=(select count(*) from org_training_session_bookings b where b.session_id=s.id and b.status in('pending_payment','reserved','attended','no_show'))+
   (select count(*) from org_training_multi_checkout_occurrences h join org_training_multi_checkout_attempts x on x.id=h.attempt_id where h.session_id=s.id and h.status='held'and x.status in('pending','checkout_pending','processing')and coalesce(x.expires_at,now()+interval'30 minutes')>now())
 ))then raise exception'occurrence_capacity_unavailable';end if;
 insert into org_training_multi_checkout_attempts(org_id,athlete_id,payer_user_id,idempotency_key,base_amount_cents,expires_at)values(o,p_athlete,p_payer,p_key,total,now()+interval'30 minutes')returning*into a;
 insert into org_training_multi_checkout_occurrences(attempt_id,session_id,amount_cents)select a.id,s.id,s.drop_in_price_cents from org_training_sessions s where s.id=any(p_sessions);
 return query select a.id,a.org_id,a.base_amount_cents,a.status;
end$$;

create or replace function public.fulfill_org_training_multi_checkout(p_attempt uuid,p_session text,p_payment_intent text)
returns table(session_id uuid,booking_id uuid)language plpgsql security definer set search_path=public as $$
declare a public.org_training_multi_checkout_attempts%rowtype;r record;b uuid;
begin
 select*into a from org_training_multi_checkout_attempts where id=p_attempt for update;if not found then raise exception'checkout_attempt_unavailable';end if;
 if a.status='succeeded'then return query select o.session_id,o.booking_id from org_training_multi_checkout_occurrences o where o.attempt_id=a.id order by o.session_id;return;end if;
 if a.stripe_checkout_session_id is distinct from p_session then raise exception'checkout_session_mismatch';end if;
 for r in select o.*,s.capacity from org_training_multi_checkout_occurrences o join org_training_sessions s on s.id=o.session_id where o.attempt_id=a.id order by o.session_id for update of s loop
   if(select count(*)from org_training_session_bookings x where x.session_id=r.session_id and x.status in('pending_payment','reserved','attended','no_show'))>=r.capacity then raise exception'occurrence_capacity_unavailable';end if;
   insert into org_training_session_bookings(session_id,athlete_id,booking_type,payment_record_id,status,booked_by)values(r.session_id,a.athlete_id,'drop_in',a.id,'reserved',a.payer_user_id)on conflict(session_id,athlete_id)do update set status=case when org_training_session_bookings.status in('cancelled','refunded')then'reserved'else org_training_session_bookings.status end,updated_at=now()returning id into b;
   update org_training_multi_checkout_occurrences set booking_id=b,status='confirmed'where attempt_id=a.id and session_id=r.session_id;session_id:=r.session_id;booking_id:=b;return next;
 end loop;
 update org_training_multi_checkout_attempts set status='succeeded',stripe_payment_intent_id=p_payment_intent,updated_at=now()where id=a.id;
end$$;

create or replace function public.cancel_org_training_occurrences(p_actor uuid,p_session uuid,p_scope text,p_reason text)
returns integer language plpgsql security definer set search_path=public as $$declare s org_training_sessions%rowtype;n integer;begin
 select*into s from org_training_sessions where id=p_session for update;if not found or not(public.is_org_director(s.org_id)or public.is_admin(p_actor))then raise exception'cancellation_forbidden';end if;
 if p_scope not in('occurrence','future','series')then raise exception'invalid_cancellation_scope';end if;
 update org_training_sessions set status='cancelled',updated_at=now()where id=p_session or(s.series_id is not null and series_id=s.series_id and(p_scope='series'and starts_at>=now()or p_scope='future'and starts_at>=s.starts_at));get diagnostics n=row_count;
 update org_training_session_bookings b set status='cancelled',cancelled_at=now(),cancellation_reason=nullif(trim(p_reason),''),updated_at=now()where b.session_id in(select id from org_training_sessions where id=p_session or(s.series_id is not null and series_id=s.series_id and status='cancelled'))and b.status in('pending_payment','reserved');return n;
end$$;

revoke all on function public.prepare_org_training_multi_checkout(uuid,uuid,uuid[],uuid),public.fulfill_org_training_multi_checkout(uuid,text,text),public.cancel_org_training_occurrences(uuid,uuid,text,text)from public,anon,authenticated;
grant execute on function public.prepare_org_training_multi_checkout(uuid,uuid,uuid[],uuid),public.fulfill_org_training_multi_checkout(uuid,text,text),public.cancel_org_training_occurrences(uuid,uuid,text,text)to service_role;
notify pgrst,'reload schema';commit;
