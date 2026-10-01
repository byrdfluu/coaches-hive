-- Keep parent/athlete onboarding independent of legacy family_id columns.
-- Direct owners and guardians with an accepted athlete invitation may manage
-- every active athlete profile they are authorized to access.
create or replace function public.my_accessible_athlete_profiles()
returns setof public.athlete_profiles
language sql
stable
security definer
set search_path=public
as $$
  select distinct ap.*
  from public.athlete_profiles ap
  where ap.status='active'
    and (
      ap.owner_user_id=auth.uid()
      or exists (
        select 1 from public.family_subscription_athletes family_link
        where family_link.athlete_profile_id=ap.id
          and family_link.subscription_owner_id=auth.uid()
      )
      or exists (
        select 1 from public.guardian_privacy_consents consent
        where consent.athlete_id=ap.id
          and consent.guardian_user_id=auth.uid()
          and consent.guardian_identity_confirmed=true
          and consent.coppa_consent_given=true
      )
    )
  order by ap.is_primary desc,ap.created_at;
$$;

revoke all on function public.my_accessible_athlete_profiles() from public,anon;
grant execute on function public.my_accessible_athlete_profiles() to authenticated;
