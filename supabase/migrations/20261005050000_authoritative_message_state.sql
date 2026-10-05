begin;
create or replace function public.mobile_thread_messages_page(p_actor_user_id uuid,p_thread_id uuid,p_limit integer,p_before_created_at timestamptz default null,p_before_id uuid default null)
returns table(id uuid,thread_id uuid,sender_id uuid,content text,attachment_type text,attachment_storage_path text,attachment_file_name text,attachment_content_type text,attachment_size_bytes bigint,created_at timestamptz,edited_at timestamptz,delivery_status text,delivered_at timestamptz,read_at timestamptz)
language sql security definer set search_path=public as $$
 select m.id,m.thread_id,m.sender_id,coalesce(nullif(m.content,''),m.body),m.attachment_type,m.attachment_storage_path,m.attachment_file_name,m.attachment_content_type,m.attachment_size_bytes,m.created_at,m.edited_at,
   case when exists(select 1 from mobile_message_receipts rr where rr.message_id=m.id and rr.read_at is not null)then'read'
     when exists(select 1 from mobile_message_receipts rr where rr.message_id=m.id and rr.delivered_at is not null)then'delivered'
     else coalesce(m.delivery_status,'sent')end,
   (select max(rr.delivered_at)from mobile_message_receipts rr where rr.message_id=m.id),
   (select max(rr.read_at)from mobile_message_receipts rr where rr.message_id=m.id)
 from messages m where m.thread_id=p_thread_id and m.deleted_at is null
   and exists(select 1 from thread_participants tp where tp.thread_id=p_thread_id and tp.user_id=p_actor_user_id)
   and(p_before_created_at is null or m.created_at<p_before_created_at or(m.created_at=p_before_created_at and m.id<p_before_id))
 order by m.created_at desc,m.id desc limit least(greatest(coalesce(p_limit,51),1),101)
$$;
revoke all on function public.mobile_thread_messages_page(uuid,uuid,integer,timestamptz,uuid)from public,anon,authenticated;
grant execute on function public.mobile_thread_messages_page(uuid,uuid,integer,timestamptz,uuid)to service_role;
notify pgrst,'reload schema';commit;
