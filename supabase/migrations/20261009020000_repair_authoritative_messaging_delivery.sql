begin;

-- Mobile message creation is performed by a service-role RPC only after the
-- API authenticates the caller, authorizes the recipient, applies blocks and
-- minor-account protections, and rate-limits the action. Direct client writes
-- must continue to match auth.uid().
create or replace function public.enforce_message_send_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
begin
  if v_role <> 'service_role' and new.sender_id is distinct from auth.uid() then
    raise exception 'Message sender does not match the signed-in user';
  end if;

  if (
    select count(*)
    from public.messages
    where sender_id = new.sender_id
      and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'Message rate limit reached. Please wait a moment.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_message_send_rate() from public, anon, authenticated;
grant execute on function public.enforce_message_send_rate() to service_role;

-- Keep every inbox consistent regardless of whether a message came from the
-- mobile RPC, a legacy authenticated insert, or the web application.
create or replace function public.touch_message_thread_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.threads
  set updated_at = greatest(coalesce(updated_at, new.created_at), new.created_at)
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists touch_message_thread_after_insert_trigger on public.messages;
create trigger touch_message_thread_after_insert_trigger
after insert on public.messages
for each row execute function public.touch_message_thread_after_insert();

revoke all on function public.touch_message_thread_after_insert() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
