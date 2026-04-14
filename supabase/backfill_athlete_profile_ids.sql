update public.athlete_metrics
set athlete_profile_id = sub_profile_id
where sub_profile_id is not null
  and athlete_profile_id is distinct from sub_profile_id;

update public.athlete_metrics as target
set athlete_profile_id = primary_profile.id
from public.athlete_profiles as primary_profile
where target.sub_profile_id is null
  and target.athlete_profile_id is distinct from primary_profile.id
  and primary_profile.owner_user_id = target.athlete_id
  and primary_profile.is_primary = true;

update public.athlete_results
set athlete_profile_id = sub_profile_id
where sub_profile_id is not null
  and athlete_profile_id is distinct from sub_profile_id;

update public.athlete_results as target
set athlete_profile_id = primary_profile.id
from public.athlete_profiles as primary_profile
where target.sub_profile_id is null
  and target.athlete_profile_id is distinct from primary_profile.id
  and primary_profile.owner_user_id = target.athlete_id
  and primary_profile.is_primary = true;

update public.athlete_media
set athlete_profile_id = sub_profile_id
where sub_profile_id is not null
  and athlete_profile_id is distinct from sub_profile_id;

update public.athlete_media as target
set athlete_profile_id = primary_profile.id
from public.athlete_profiles as primary_profile
where target.sub_profile_id is null
  and target.athlete_profile_id is distinct from primary_profile.id
  and primary_profile.owner_user_id = target.athlete_id
  and primary_profile.is_primary = true;

update public.athlete_progress_notes
set athlete_profile_id = sub_profile_id
where sub_profile_id is not null
  and athlete_profile_id is distinct from sub_profile_id;

update public.athlete_progress_notes as target
set athlete_profile_id = primary_profile.id
from public.athlete_profiles as primary_profile
where target.sub_profile_id is null
  and target.athlete_profile_id is distinct from primary_profile.id
  and primary_profile.owner_user_id = target.athlete_id
  and primary_profile.is_primary = true;

update public.profile_visibility
set athlete_profile_id = sub_profile_id
where sub_profile_id is not null
  and athlete_profile_id is distinct from sub_profile_id;

update public.profile_visibility as target
set athlete_profile_id = primary_profile.id
from public.athlete_profiles as primary_profile
where target.sub_profile_id is null
  and target.athlete_profile_id is distinct from primary_profile.id
  and primary_profile.owner_user_id = target.athlete_id
  and primary_profile.is_primary = true;

update public.sessions
set athlete_profile_id = sub_profile_id
where sub_profile_id is not null
  and athlete_profile_id is distinct from sub_profile_id;

update public.sessions as target
set athlete_profile_id = primary_profile.id
from public.athlete_profiles as primary_profile
where target.sub_profile_id is null
  and target.athlete_profile_id is distinct from primary_profile.id
  and primary_profile.owner_user_id = target.athlete_id
  and primary_profile.is_primary = true;

update public.orders
set athlete_profile_id = sub_profile_id
where sub_profile_id is not null
  and athlete_profile_id is distinct from sub_profile_id;

update public.orders as target
set athlete_profile_id = primary_profile.id
from public.athlete_profiles as primary_profile
where target.sub_profile_id is null
  and target.athlete_profile_id is distinct from primary_profile.id
  and primary_profile.owner_user_id = target.athlete_id
  and primary_profile.is_primary = true;

with primary_profiles as (
  select owner_user_id, id
  from public.athlete_profiles
  where is_primary = true
)
update public.payment_receipts as receipt
set metadata = coalesce(receipt.metadata, '{}'::jsonb) || jsonb_build_object(
  'athlete_profile_id',
  coalesce(nullif(receipt.metadata->>'sub_profile_id', ''), primary_profiles.id::text)
)
from primary_profiles
where primary_profiles.owner_user_id = coalesce(
    case
      when coalesce(receipt.metadata->>'athlete_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (receipt.metadata->>'athlete_id')::uuid
      else null
    end,
    receipt.payer_id
  )
  and coalesce(receipt.metadata->>'athlete_profile_id', '') is distinct from coalesce(nullif(receipt.metadata->>'sub_profile_id', ''), primary_profiles.id::text);
