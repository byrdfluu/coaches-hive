begin;

-- Direct client inserts must still match auth.uid(). Server-authoritative
-- messaging uses the service-role client after authenticating, authorizing,
-- and rate-limiting the mobile actor in the API/RPC layer, so auth.uid() is
-- intentionally unavailable there. Rate-limit both paths by the persisted
-- sender_id rather than the JWT identity.
create or replace function public.enforce_message_send_rate()
returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_role text:=coalesce(auth.role(),current_setting('request.jwt.claim.role',true),'');
begin
  if v_role<>'service_role' and new.sender_id is distinct from auth.uid() then
    raise exception 'Message sender does not match the signed-in user';
  end if;
  if (select count(*) from public.messages
      where sender_id=new.sender_id and created_at>now()-interval '1 minute')>=30 then
    raise exception 'Message rate limit reached. Please wait a moment.';
  end if;
  return new;
end $$;

revoke all on function public.enforce_message_send_rate() from public,anon,authenticated;
grant execute on function public.enforce_message_send_rate() to service_role;

notify pgrst,'reload schema';
commit;
