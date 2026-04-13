update public.athlete_metrics
set athlete_profile_id = coalesce(sub_profile_id, athlete_id)
where athlete_profile_id is null;

update public.athlete_results
set athlete_profile_id = coalesce(sub_profile_id, athlete_id)
where athlete_profile_id is null;

update public.athlete_media
set athlete_profile_id = coalesce(sub_profile_id, athlete_id)
where athlete_profile_id is null;

update public.athlete_progress_notes
set athlete_profile_id = coalesce(sub_profile_id, athlete_id)
where athlete_profile_id is null;

update public.profile_visibility
set athlete_profile_id = coalesce(sub_profile_id, athlete_id)
where athlete_profile_id is null;

update public.sessions
set athlete_profile_id = coalesce(sub_profile_id, athlete_id)
where athlete_profile_id is null;

update public.orders
set athlete_profile_id = coalesce(sub_profile_id, athlete_id)
where athlete_profile_id is null;

update public.payment_receipts
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'athlete_profile_id',
  coalesce(
    metadata->>'athlete_profile_id',
    metadata->>'sub_profile_id',
    payer_id::text
  )
)
where metadata is null
   or not (metadata ? 'athlete_profile_id');
