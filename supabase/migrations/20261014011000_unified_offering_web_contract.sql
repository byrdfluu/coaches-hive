begin;

alter table public.program_registrations
  add column if not exists fulfillment_mode text,
  add column if not exists unit_price_cents integer,
  add column if not exists quantity integer,
  add column if not exists subtotal_cents integer,
  add column if not exists platform_fee_cents integer,
  add column if not exists final_amount_cents integer;
alter table public.org_tryout_registrations
  add column if not exists fulfillment_mode text,
  add column if not exists unit_price_cents integer,
  add column if not exists quantity integer,
  add column if not exists subtotal_cents integer,
  add column if not exists platform_fee_cents integer,
  add column if not exists final_amount_cents integer;

-- Keep the workspace-scoped mobile contract authoritative while accepting the
-- finalized fulfillment fields added by the unified lifecycle migration.
create or replace function public.org_mobile_save_tryout(p_workspace_id uuid,p_org_id uuid,p_tryout jsonb,p_tryout_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare item public.org_tryouts; saved_id uuid;
begin
 perform public.org_mobile_tryout_access(p_workspace_id,p_org_id);
 if jsonb_typeof(p_tryout) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_tryout) k where k not in
 ('title','sport','tryout_date','location','max_participants','notes','status','price','fulfillment_mode','price_per_occurrence_cents','credits_per_period','billing_interval','renews_until_cancelled','cancellation_cutoff_hours'))
 then raise exception 'Invalid tryout fields' using errcode='22023'; end if;
 item:=jsonb_populate_record(null::public.org_tryouts,p_tryout);
 if nullif(trim(item.title),'') is null or item.max_participants<=0 or item.price<0 or item.price::text='NaN'
 or item.status is null or item.status not in ('open','closed','cancelled')
 or item.fulfillment_mode not in ('series','per_occurrence','credit_membership','free')
 or (item.fulfillment_mode='credit_membership' and (coalesce(item.credits_per_period,0)<1 or item.billing_interval not in ('month','year')))
 then raise exception 'Enter valid tryout and fulfillment details' using errcode='22023'; end if;
 if p_tryout_id is null then
  insert into public.org_tryouts(org_id,title,sport,tryout_date,location,max_participants,notes,status,price,fulfillment_mode,price_per_occurrence_cents,credits_per_period,billing_interval,renews_until_cancelled,cancellation_cutoff_hours)
  values(p_org_id,trim(item.title),nullif(trim(item.sport),''),item.tryout_date,nullif(trim(item.location),''),item.max_participants,nullif(trim(item.notes),''),item.status,item.price,item.fulfillment_mode,item.price_per_occurrence_cents,item.credits_per_period,item.billing_interval,item.renews_until_cancelled,item.cancellation_cutoff_hours)
  returning id into saved_id;
 else
  update public.org_tryouts set title=trim(item.title),sport=nullif(trim(item.sport),''),tryout_date=item.tryout_date,location=nullif(trim(item.location),''),max_participants=item.max_participants,notes=nullif(trim(item.notes),''),status=item.status,price=item.price,fulfillment_mode=item.fulfillment_mode,price_per_occurrence_cents=item.price_per_occurrence_cents,credits_per_period=item.credits_per_period,billing_interval=item.billing_interval,renews_until_cancelled=item.renews_until_cancelled,cancellation_cutoff_hours=item.cancellation_cutoff_hours,updated_at=now()
  where id=p_tryout_id and org_id=p_org_id returning id into saved_id;
  if not found then raise exception 'Tryout unavailable' using errcode='42501'; end if;
 end if;
 return saved_id;
end $$;

create or replace function public.reschedule_family_offering_occurrence(p_selection_id uuid,p_replacement_occurrence_id uuid,p_reason text default null)
returns table(replacement_occurrence_id uuid,credit_returned boolean)
language plpgsql security definer set search_path=public as $$
declare old_row public.org_offering_registration_occurrences%rowtype; returned boolean;
begin
 select * into old_row from public.org_offering_registration_occurrences where id=p_selection_id for update;
 if old_row.id is null then raise exception 'Booking unavailable'; end if;
 returned:=public.cancel_family_offering_occurrence(p_selection_id,p_reason);
 perform public.select_family_offering_occurrences(old_row.registration_id,case when old_row.registration_type='tryout' then 'tryout' else
   (select p.type from public.program_registrations r join public.programs p on p.id=r.program_id where r.id=old_row.registration_id) end,
   array[p_replacement_occurrence_id],old_row.athlete_id);
 return query select p_replacement_occurrence_id,returned;
end $$;
revoke all on function public.reschedule_family_offering_occurrence(uuid,uuid,text) from public,anon;
grant execute on function public.reschedule_family_offering_occurrence(uuid,uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
