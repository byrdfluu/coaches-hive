-- Coach review verification + coach responses

alter table public.coach_reviews
  add column if not exists verified boolean not null default false;

alter table public.coach_reviews
  add column if not exists coach_response text;

alter table public.coach_reviews
  add column if not exists coach_response_at timestamptz;

drop policy if exists "coach reviews insert" on public.coach_reviews;
create policy "coach reviews insert" on public.coach_reviews
  for insert with check (
    (
      athlete_id = auth.uid()
      and verified = true
      and exists (
        select 1
        from public.sessions s
        where s.coach_id = coach_reviews.coach_id
          and s.athlete_id = auth.uid()
          and s.end_time < now()
          and coalesce(s.status, '') not in ('Canceled','Cancelled')
      )
    )
    or (auth.jwt() ->> 'role') = 'admin'
  );

drop policy if exists "coach reviews update coach response" on public.coach_reviews;
create policy "coach reviews update coach response" on public.coach_reviews
  for update
  using (
    coach_id = auth.uid()
    or (auth.jwt() ->> 'role') = 'admin'
  )
  with check (
    coach_id = auth.uid()
    or (auth.jwt() ->> 'role') = 'admin'
  );
