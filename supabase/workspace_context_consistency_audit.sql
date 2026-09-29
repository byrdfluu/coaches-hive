-- READ-ONLY workspace/tenant consistency audit.
-- Run this report and review every result before applying any repair.

-- Preferences and memberships referencing a missing workspace.
select 'active_workspace_preference_missing_workspace' as issue, p.user_id::text as record_id,
  p.workspace_id::text as workspace_id, null::text as supplied_owner_id, null::text as authoritative_owner_id
from public.active_workspace_preferences p
left join public.business_workspaces w on w.id = p.workspace_id
where w.id is null
union all
select 'workspace_membership_missing_workspace', m.id::text, m.workspace_id::text, null, null
from public.workspace_memberships m
left join public.business_workspaces w on w.id = m.workspace_id
where w.id is null;

-- Invalid organization workspaces.
select case when w.organization_id is null then 'organization_workspace_missing_organization_id'
    else 'organization_workspace_missing_organization' end as issue,
  w.id::text as workspace_id, w.display_name, w.organization_id::text
from public.business_workspaces w
left join public.organizations o on o.id = w.organization_id
where w.workspace_type = 'organization' and (w.organization_id is null or o.id is null);

-- More than one non-archived workspace for the same organization.
select 'duplicate_organization_workspaces' as issue, organization_id::text,
  count(*) as workspace_count, array_agg(id order by created_at) as workspace_ids
from public.business_workspaces
where workspace_type = 'organization' and status <> 'archived' and organization_id is not null
group by organization_id having count(*) > 1;

-- Records that carry both workspace and organization ownership but disagree.
select 'platform_subscription_workspace_org_mismatch' as issue, s.id::text as record_id,
  s.workspace_id::text, s.organization_id::text as supplied_owner_id,
  w.organization_id::text as authoritative_owner_id
from public.platform_subscriptions s
join public.business_workspaces w on w.id = s.workspace_id
where s.organization_id is not null and s.organization_id is distinct from w.organization_id
union all
select 'stripe_connect_workspace_org_mismatch', a.id::text, a.workspace_id::text,
  a.org_id::text, w.organization_id::text
from public.stripe_connect_accounts a
join public.business_workspaces w on w.id = a.workspace_id
where a.org_id is not null and a.org_id is distinct from w.organization_id
union all
select 'org_invite_workspace_org_mismatch', i.id::text, i.workspace_id::text,
  i.org_id::text, w.organization_id::text
from public.org_invites i
join public.business_workspaces w on w.id = i.workspace_id
where i.org_id is distinct from w.organization_id;

-- Organization memberships without exactly one active organization workspace.
select 'organization_membership_without_active_workspace' as issue, m.id::text as record_id,
  m.user_id::text, m.org_id::text, count(w.id) as active_workspace_count
from public.organization_memberships m
left join public.business_workspaces w on w.organization_id = m.org_id
  and w.workspace_type = 'organization' and w.status = 'active'
where m.status = 'active'
group by m.id, m.user_id, m.org_id
having count(w.id) <> 1;
