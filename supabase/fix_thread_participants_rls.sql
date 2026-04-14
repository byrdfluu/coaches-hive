-- Fix infinite recursion in thread_participants SELECT policy.
-- The old policy referenced thread_participants inside its own USING clause,
-- which can cause recursive RLS evaluation.
-- Replace with a SECURITY DEFINER function that queries the table bypassing RLS.
--
-- Run this in the Supabase SQL editor.

create or replace function public.current_user_thread_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select thread_id from public.thread_participants where user_id = auth.uid();
$$;

-- Drop both versions of the recursive policy (rls.sql and rls-core.sql names)
drop policy if exists "thread participants select" on public.thread_participants;
drop policy if exists "participants_select_self" on public.thread_participants;

-- Non-recursive replacement
create policy "thread_participants_select" on public.thread_participants
  for select
  using (
    public.is_admin()
    or user_id = auth.uid()
    or thread_id in (select public.current_user_thread_ids())
  );
