-- Family installment agreements. Amounts are immutable integer USD cents.
-- Stripe remains the card vault; service-role backend workers create charges.

alter table public.programs
  add column if not exists payment_plan_enabled boolean not null default false,
  add column if not exists payment_plan_installments integer,
  add column if not exists payment_plan_frequency text,
  add column if not exists payment_plan_first_payment_cents integer;
alter table public.programs drop constraint if exists programs_payment_plan_check;
alter table public.programs add constraint programs_payment_plan_check check (
  not payment_plan_enabled or (
    payment_plan_installments between 2 and 12 and
    payment_plan_frequency in ('weekly','biweekly','monthly') and
    payment_plan_first_payment_cents > 0 and
    payment_plan_first_payment_cents < round(coalesce(price,0)*100)
  )
);

alter table public.coach_fee_assignments
  add column if not exists payment_plan_enabled boolean not null default false,
  add column if not exists payment_plan_installments integer,
  add column if not exists payment_plan_frequency text,
  add column if not exists payment_plan_first_payment_cents integer;

create table if not exists public.family_payment_plan_enrollments (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check(source_type in ('program','org_fee','coach_fee')),
  source_id uuid not null,
  workspace_id uuid references public.business_workspaces(id) on delete restrict,
  org_id uuid references public.organizations(id) on delete set null,
  coach_id uuid references public.profiles(id) on delete set null,
  payer_id uuid not null references public.profiles(id) on delete restrict,
  athlete_profile_id uuid not null references public.athlete_profiles(id) on delete restrict,
  total_amount_cents bigint not null check(total_amount_cents>0),
  amount_paid_cents bigint not null default 0 check(amount_paid_cents>=0),
  installment_count integer not null check(installment_count between 2 and 12),
  frequency text not null check(frequency in ('weekly','biweekly','monthly')),
  status text not null default 'pending_first_payment' check(status in ('pending_first_payment','active','past_due','paid','canceled')),
  autopay_consent_at timestamptz not null,
  consent_text_version text not null default 'family-installments-v1',
  stripe_customer_id text,
  stripe_payment_method_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(source_type,source_id,athlete_profile_id)
);

create table if not exists public.family_payment_plan_installments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.family_payment_plan_enrollments(id) on delete cascade,
  sequence_number integer not null check(sequence_number>0),
  amount_cents bigint not null check(amount_cents>0),
  due_at timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','pending','processing','paid','failed','past_due','waived','refunded','canceled')),
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  stripe_payment_intent_id text,
  attempt_count integer not null default 0,
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(enrollment_id,sequence_number)
);

alter table public.family_payment_plan_enrollments enable row level security;
alter table public.family_payment_plan_installments enable row level security;
create policy family_plans_visible on public.family_payment_plan_enrollments for select using (
  payer_id=auth.uid() or public.is_admin(auth.uid()) or
  (org_id is not null and public.is_org_director(org_id)) or coach_id=auth.uid()
);
create policy family_installments_visible on public.family_payment_plan_installments for select using (
  exists(select 1 from public.family_payment_plan_enrollments e where e.id=enrollment_id and
    (e.payer_id=auth.uid() or public.is_admin(auth.uid()) or (e.org_id is not null and public.is_org_director(e.org_id)) or e.coach_id=auth.uid()))
);
revoke insert,update,delete on public.family_payment_plan_enrollments,public.family_payment_plan_installments from authenticated,anon;

create or replace function public.enroll_program_payment_plan(p_program_id uuid,p_athlete_profile_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare p public.programs%rowtype; eid uuid; total bigint; first_amount bigint; remaining bigint; base bigint; extra bigint; i integer; step_interval interval;
begin
  if not public.owns_athlete_profile(p_athlete_profile_id) then raise exception 'Athlete access required'; end if;
  select * into p from public.programs where id=p_program_id and status='active' and payment_plan_enabled=true for update;
  if not found then raise exception 'Payment plan is unavailable'; end if;
  total:=round(p.price*100); first_amount:=p.payment_plan_first_payment_cents; remaining:=total-first_amount;
  insert into public.family_payment_plan_enrollments(source_type,source_id,workspace_id,org_id,payer_id,athlete_profile_id,total_amount_cents,installment_count,frequency,autopay_consent_at)
  values('program',p.id,p.workspace_id,p.org_id,auth.uid(),p_athlete_profile_id,total,p.payment_plan_installments,p.payment_plan_frequency,now())
  on conflict(source_type,source_id,athlete_profile_id) do update set updated_at=now()
  returning id into eid;
  if not exists(select 1 from public.family_payment_plan_installments where enrollment_id=eid) then
    step_interval:=case p.payment_plan_frequency when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' else interval '1 month' end;
    insert into public.family_payment_plan_installments(enrollment_id,sequence_number,amount_cents,due_at,status)
    values(eid,1,first_amount,now(),'pending');
    base:=remaining/(p.payment_plan_installments-1); extra:=remaining%(p.payment_plan_installments-1);
    for i in 2..p.payment_plan_installments loop
      insert into public.family_payment_plan_installments(enrollment_id,sequence_number,amount_cents,due_at)
      values(eid,i,base+case when i-1<=extra then 1 else 0 end,now()+step_interval*(i-1));
    end loop;
  end if;
  return eid;
end $$;
revoke all on function public.enroll_program_payment_plan(uuid,uuid) from public,anon;
grant execute on function public.enroll_program_payment_plan(uuid,uuid) to authenticated;
grant all on public.family_payment_plan_enrollments,public.family_payment_plan_installments to service_role;
