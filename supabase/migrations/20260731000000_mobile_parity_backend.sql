-- Mobile parity: support unread state and authoritative paid-booking lifecycle.

alter table public.support_tickets
  add column if not exists requester_unread_count integer not null default 0,
  add column if not exists staff_unread_count integer not null default 0;

alter table public.support_messages
  add column if not exists customer_read_at timestamptz,
  add column if not exists staff_read_at timestamptz;

alter table public.coach_fee_assignments
  add column if not exists booking_status text not null default 'active',
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by uuid,
  add column if not exists cancellation_reason text,
  add column if not exists rescheduled_at timestamptz;

alter table public.sessions
  add column if not exists cancellation_reason text,
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by uuid references public.profiles(id) on delete set null,
  add column if not exists rescheduled_from_start_time timestamptz,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists rescheduled_by uuid references public.profiles(id) on delete set null;

alter table public.marketplace_orders
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists receipt_url text;

alter table public.org_fee_assignments add column if not exists receipt_url text;
alter table public.coach_fee_assignments add column if not exists receipt_url text;

alter table public.support_tickets
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists description text,
  add column if not exists category text,
  add column if not exists admin_notes text;

create or replace function public.increment_support_unread(
  p_ticket_id uuid,
  p_audience text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_audience = 'staff' then
    update public.support_tickets
       set staff_unread_count = staff_unread_count + 1,
           updated_at = now()
     where id = p_ticket_id;
  elsif p_audience = 'requester' then
    update public.support_tickets
       set requester_unread_count = requester_unread_count + 1,
           updated_at = now()
     where id = p_ticket_id;
  else
    raise exception 'Unsupported support audience';
  end if;
end;
$$;

revoke all on function public.increment_support_unread(uuid, text) from public, anon, authenticated;

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  is_staff boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.support_ticket_messages
  add column if not exists source_message_id uuid;
create unique index if not exists support_ticket_messages_source_message_uidx
  on public.support_ticket_messages(source_message_id)
  where source_message_id is not null;

create index if not exists support_ticket_messages_ticket_date_idx
  on public.support_ticket_messages(ticket_id, created_at);
alter table public.support_ticket_messages enable row level security;

drop policy if exists "support_participants_read_messages" on public.support_ticket_messages;
create policy "support_participants_read_messages"
on public.support_ticket_messages for select
using (
  exists (
    select 1 from public.support_tickets t
    where t.id = ticket_id and (
      t.user_id = auth.uid()
      or (t.metadata ->> 'requester_id') = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'superadmin')
      )
    )
  )
);

create or replace function public.sync_support_message_to_native_thread()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.sender_id is null or coalesce(new.is_internal, false) then return new; end if;
  insert into public.support_ticket_messages(
    ticket_id, sender_id, body, is_staff, created_at, source_message_id
  ) values (
    new.ticket_id,
    new.sender_id,
    new.body,
    lower(coalesce(new.sender_role, '')) in ('admin','support','ops','finance','superadmin'),
    new.created_at,
    new.id
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists sync_support_message_to_native_thread_trigger
  on public.support_messages;
create trigger sync_support_message_to_native_thread_trigger
after insert on public.support_messages
for each row execute function public.sync_support_message_to_native_thread();

insert into public.support_ticket_messages(
  ticket_id, sender_id, body, is_staff, created_at, source_message_id
)
select
  m.ticket_id,
  m.sender_id,
  m.body,
  lower(coalesce(m.sender_role, '')) in ('admin','support','ops','finance','superadmin'),
  m.created_at,
  m.id
from public.support_messages m
where m.sender_id is not null and not coalesce(m.is_internal, false)
on conflict do nothing;

create or replace function public.reply_to_support_ticket(p_ticket_id uuid, p_body text)
returns public.support_ticket_messages
language plpgsql security definer set search_path = public
as $$
declare
  v_message public.support_ticket_messages%rowtype;
  v_is_staff boolean;
  v_source_message_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'Reply cannot be empty'; end if;
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'superadmin')
  ) into v_is_staff;
  if not exists (
    select 1 from public.support_tickets t
    where t.id = p_ticket_id and (
      t.user_id = auth.uid()
      or (t.metadata ->> 'requester_id') = auth.uid()::text
      or v_is_staff
    )
  ) then raise exception 'Support ticket not found'; end if;

  insert into public.support_messages(
    ticket_id, sender_id, sender_role, sender_name, body, is_internal
  ) values (
    p_ticket_id,
    auth.uid(),
    case when v_is_staff then 'admin' else 'user' end,
    case when v_is_staff then 'Coaches Hive Support' else 'User' end,
    trim(p_body),
    false
  ) returning id into v_source_message_id;
  select * into v_message from public.support_ticket_messages
  where source_message_id = v_source_message_id;
  perform public.increment_support_unread(
    p_ticket_id,
    case when v_is_staff then 'requester' else 'staff' end
  );
  return v_message;
end;
$$;
revoke all on function public.reply_to_support_ticket(uuid, text) from public, anon;
grant execute on function public.reply_to_support_ticket(uuid, text) to authenticated;

create or replace function public.cancel_athlete_booking(
  p_session_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_assignment public.coach_fee_assignments%rowtype;
  v_refund_status text;
  v_released boolean := false;
begin
  select s.* into v_session
  from public.sessions s
  join public.athlete_profiles ap on ap.id = s.athlete_id
  where s.id = p_session_id and ap.owner_user_id = auth.uid()
  for update of s;
  if not found then raise exception 'Booking not found'; end if;
  if lower(coalesce(v_session.status, '')) in ('cancelled','canceled','completed') then
    raise exception 'This booking can no longer be canceled';
  end if;
  if v_session.start_time <= now() then raise exception 'Past or started sessions cannot be canceled'; end if;

  update public.sessions set
    status = 'canceled',
    cancellation_reason = nullif(trim(p_reason), ''),
    canceled_at = now(),
    canceled_by = auth.uid(),
    updated_at = now()
  where id = p_session_id returning * into v_session;

  if v_session.payment_assignment_id is not null then
    select * into v_assignment from public.coach_fee_assignments
    where id = v_session.payment_assignment_id for update;
    if found then
      update public.coach_fee_assignments set
        status = 'canceled',
        booking_status = 'canceled',
        canceled_at = now(),
        canceled_by = auth.uid(),
        cancellation_reason = nullif(trim(p_reason), ''),
        updated_at = now()
      where id = v_assignment.id;
      v_released := lower(coalesce(v_assignment.session_type, '')) in ('group','camp');
      if lower(coalesce(v_assignment.status, '')) = 'paid' then
        insert into public.payment_refund_requests(
          requester_id, athlete_id, payment_type, payment_record_id, amount, reason
        ) values (
          auth.uid(), v_assignment.athlete_id, 'coach_fee', v_assignment.id,
          v_assignment.amount, coalesce(nullif(trim(p_reason), ''), 'Paid booking canceled by athlete')
        ) on conflict do nothing;
        select status into v_refund_status
        from public.payment_refund_requests
        where requester_id = auth.uid()
          and payment_type = 'coach_fee'
          and payment_record_id = v_assignment.id
        order by requested_at desc limit 1;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'booking_status', v_session.status,
    'released_capacity', v_released,
    'payment_status', coalesce(v_assignment.status, null),
    'refund_status', v_refund_status,
    'session', to_jsonb(v_session)
  );
end;
$$;

create or replace function public.reschedule_athlete_booking(
  p_session_id uuid,
  p_availability_block_id uuid,
  p_start_time timestamptz
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_duration integer;
  v_end timestamptz;
  v_capacity integer;
  v_kind text;
  v_taken integer;
  v_payment_status text;
begin
  select s.* into v_session
  from public.sessions s
  join public.athlete_profiles ap on ap.id = s.athlete_id
  where s.id = p_session_id and ap.owner_user_id = auth.uid()
  for update of s;
  if not found then raise exception 'Booking not found'; end if;
  if lower(coalesce(v_session.status, '')) in ('cancelled','canceled','completed') then
    raise exception 'This booking can no longer be rescheduled';
  end if;
  if p_start_time <= now() + interval '15 minutes' then
    raise exception 'Choose a time at least 15 minutes from now';
  end if;
  v_duration := greatest(15, coalesce(v_session.duration_minutes, 60));
  v_end := p_start_time + make_interval(mins => v_duration);

  select greatest(1, coalesce(ab.capacity, 1)),
    case
      when lower(replace(coalesce(ab.session_type,''),' ','_')) in ('group','group_session') then 'group'
      when lower(replace(coalesce(ab.session_type,''),' ','_')) in ('camp','camps') then 'camp'
      else 'one_on_one'
    end
  into v_capacity, v_kind
  from public.availability_blocks ab
  where ab.id = p_availability_block_id and ab.coach_id = v_session.coach_id;
  if v_capacity is null then raise exception 'That time is no longer available'; end if;

  select count(*) into v_taken from public.sessions s
  where s.id <> p_session_id
    and s.coach_id = v_session.coach_id
    and lower(coalesce(s.status,'scheduled')) not in ('cancelled','canceled')
    and s.start_time = p_start_time
    and coalesce(s.session_type,'one_on_one') = v_kind;
  if v_taken >= v_capacity then raise exception 'That session is full'; end if;

  update public.sessions set
    rescheduled_from_start_time = coalesce(rescheduled_from_start_time, start_time),
    start_time = p_start_time,
    end_time = v_end,
    rescheduled_at = now(),
    rescheduled_by = auth.uid(),
    status = 'scheduled',
    updated_at = now()
  where id = p_session_id returning * into v_session;
  select status into v_payment_status from public.coach_fee_assignments
  where id = v_session.payment_assignment_id;
  return jsonb_build_object(
    'booking_status', v_session.status,
    'released_capacity', false,
    'payment_status', v_payment_status,
    'refund_status', null,
    'session', to_jsonb(v_session)
  );
end;
$$;

revoke all on function public.cancel_athlete_booking(uuid, text) from public, anon;
grant execute on function public.cancel_athlete_booking(uuid, text) to authenticated;
revoke all on function public.reschedule_athlete_booking(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_athlete_booking(uuid, uuid, timestamptz) to authenticated;

create or replace function public.organization_mobile_capabilities(p_org_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public
as $$
declare v_role text; v_custom jsonb;
begin
  select lower(coalesce(m.role,'viewer')) into v_role
  from public.organization_memberships m
  where m.org_id = p_org_id and m.user_id = auth.uid()
    and lower(coalesce(m.status,'active')) in ('active','accepted')
  limit 1;
  if v_role is null then raise exception 'Active organization membership required'; end if;
  select coalesce(r.permissions, '{}'::jsonb) into v_custom
  from public.org_role_permissions r where r.org_id = p_org_id and r.role = v_role;
  return jsonb_build_object(
    'role', v_role, 'view_dashboard', true, 'view_schedule', true,
    'view_members', v_role in ('owner','admin','org_admin','coach','team_manager'),
    'manage_teams', v_role in ('owner','admin','org_admin','team_manager'),
    'manage_members', v_role in ('owner','admin','org_admin'),
    'manage_coaches', v_role in ('owner','admin','org_admin'),
    'manage_permissions', v_role in ('owner','admin','org_admin'),
    'manage_billing', v_role in ('owner','admin','org_admin'),
    'manage_marketplace', v_role in ('owner','admin','org_admin'),
    'manage_waivers', v_role in ('owner','admin','org_admin','coach'),
    'view_reports', v_role <> 'viewer', 'send_messages', v_role <> 'viewer'
  ) || coalesce(v_custom, '{}'::jsonb);
end;
$$;
revoke all on function public.organization_mobile_capabilities(uuid) from public, anon;
grant execute on function public.organization_mobile_capabilities(uuid) to authenticated;

create or replace function public.cancel_marketplace_order(p_order_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_order public.marketplace_orders%rowtype; v_refund_status text;
begin
  select * into v_order from public.marketplace_orders
  where id = p_order_id and buyer_id = auth.uid() for update;
  if not found then raise exception 'Order not found'; end if;
  if lower(coalesce(v_order.fulfillment_status,'pending')) not in ('pending','processing') then
    raise exception 'This order can no longer be canceled';
  end if;
  update public.marketplace_orders set
    fulfillment_status = 'canceled', delivery_status = 'canceled',
    cancellation_requested_at = now(), cancellation_reason = nullif(trim(p_reason),''),
    updated_at = now()
  where id = p_order_id returning * into v_order;
  if lower(coalesce(v_order.payment_status,v_order.status,'')) = 'paid' then
    insert into public.payment_refund_requests(
      requester_id,payment_type,payment_record_id,amount,reason
    ) values (
      auth.uid(),'marketplace_order',v_order.id,coalesce(v_order.total_amount,v_order.amount),
      coalesce(nullif(trim(p_reason),''),'Marketplace order canceled by buyer')
    ) on conflict do nothing;
    select status into v_refund_status from public.payment_refund_requests
    where requester_id = auth.uid() and payment_type = 'marketplace_order'
      and payment_record_id = v_order.id order by requested_at desc limit 1;
  end if;
  return jsonb_build_object(
    'order',to_jsonb(v_order),'cancellation_status','canceled',
    'payment_status',coalesce(v_order.payment_status,v_order.status),
    'refund_status',v_refund_status
  );
end;
$$;
revoke all on function public.cancel_marketplace_order(uuid, text) from public, anon;
grant execute on function public.cancel_marketplace_order(uuid, text) to authenticated;
