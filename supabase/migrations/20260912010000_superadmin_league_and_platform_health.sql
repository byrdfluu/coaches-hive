-- Superadmin visibility for the league, privacy, discovery, and notification
-- capabilities added after the original admin portal shipped.

create or replace function public.admin_governance_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admin access required'; end if;

  select jsonb_build_object(
    'leagues', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'name', l.name, 'sport', l.sport,
      'general_location', l.general_location, 'status', l.status,
      'max_teams', l.max_teams, 'billing_model', l.billing_model,
      'team_count', (select count(distinct a.team_id) from league_team_assignments a where a.league_id=l.id and a.status='active'),
      'organization_count', (select count(*) from league_organizations o where o.league_id=l.id and o.status='active'),
      'administrator_count', (select count(*) from league_memberships m where m.league_id=l.id and m.status='active'),
      'registration_count', (select count(*) from league_registrations r where r.league_id=l.id and r.status<>'withdrawn'),
      'outstanding_cents', (select coalesce(sum(greatest(f.amount_cents-f.paid_cents,0)),0) from league_fee_assignments f where f.league_id=l.id and f.status in ('unpaid','partial')),
      'missing_documents', (select count(*) from league_document_submissions d where d.league_id=l.id and d.status in ('rejected','expired')),
      'active_season', (select s.name from league_seasons s where s.league_id=l.id and s.is_active limit 1)
    ) order by l.created_at desc) from leagues l), '[]'::jsonb),
    'slack_pending', (select count(*) from slack_event_outbox where status='pending'),
    'slack_failed', (select count(*) from slack_event_outbox where status='failed'),
    'slack_dead_letter', (select count(*) from slack_event_outbox where status='dead_letter'),
    'slack_sent_24h', (select count(*) from slack_event_outbox where status='sent' and sent_at>=now()-interval '24 hours'),
    'push_failed_24h', (select count(*) from push_notification_deliveries where status<>'delivered' and created_at>=now()-interval '24 hours'),
    'push_delivered_24h', (select count(*) from push_notification_deliveries where status='delivered' and created_at>=now()-interval '24 hours'),
    'test_users', (select count(*) from profiles where is_test),
    'test_organizations', (select count(*) from organizations where is_test),
    'public_coaches', (select count(*) from profiles p join independent_coach_profiles c on c.coach_id=p.id where c.is_active and not p.is_test and coalesce(p.status,'active')='active'),
    'public_organizations', (select count(*) from organizations where not is_test and status='active'),
    'minor_consent_attention', (select count(*) from athlete_profiles
      where public.try_iso_date(birthdate::text) > current_date - interval '13 years'
        and not coalesce(coppa_consent_given,false)),
    'guardian_invites_pending', (select count(*) from athlete_guardian_invitations where status='pending'),
    'league_access_pending', (select count(*) from league_access_invitations where status in ('pending','pending_approval'))
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_governance_snapshot() from public, anon;
grant execute on function public.admin_governance_snapshot() to authenticated;

create or replace function public.admin_retry_slack_events(p_event_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admin access required'; end if;
  update slack_event_outbox
    set status='pending', available_at=now(), locked_at=null, last_error=null, updated_at=now()
  where status in ('failed','dead_letter') and (p_event_id is null or id=p_event_id);
  get diagnostics changed = row_count;
  insert into admin_audit_log(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'slack_delivery_retry','slack_event_outbox',p_event_id,
    jsonb_build_object('records_requeued',changed));
  return changed;
end;
$$;

revoke all on function public.admin_retry_slack_events(uuid) from public, anon;
grant execute on function public.admin_retry_slack_events(uuid) to authenticated;
