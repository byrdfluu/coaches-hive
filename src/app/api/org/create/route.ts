import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeOrgTier } from '@/lib/planRules'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
import { getSessionRoleState } from '@/lib/sessionRoleState'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const safeServerError = (message: string, status = 500) =>
  NextResponse.json({ error: message }, { status })

const isMissingOrgSettingsPlanColumnError = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false
  const combined = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
  return (
    combined.includes('pgrst204')
    || combined.includes('column')
    && (combined.includes('plan') || combined.includes('plan_status'))
    && (combined.includes('does not exist') || combined.includes('schema cache'))
  )
}

const initializeOrgSettings = async ({
  orgId,
  orgName,
}: {
  orgId: string
  orgName: string
}) => {
  const baseSeed = await supabaseAdmin
    .from('org_settings')
    .upsert(
      {
        org_id: orgId,
        org_name: orgName,
      },
      { onConflict: 'org_id' },
    )

  if (!baseSeed.error) {
    return { ok: true as const, degraded: false }
  }

  if (!isMissingOrgSettingsPlanColumnError(baseSeed.error)) {
    return { ok: false as const, error: baseSeed.error }
  }

  console.warn('[api/org/create] org_settings plan columns unavailable, falling back to base seed', {
    orgId,
    error: baseSeed.error.message,
  })

  const legacySeed = await supabaseAdmin
    .from('org_settings')
    .upsert(
      {
        org_id: orgId,
        org_name: orgName,
      },
      { onConflict: 'org_id' },
    )

  if (legacySeed.error) {
    return { ok: false as const, error: legacySeed.error }
  }

  return { ok: true as const, degraded: true }
}

const ADMIN_ROLE_MAP: Record<string, string> = {
  school: 'school_admin',
  club: 'club_admin',
  travel: 'travel_admin',
  academy: 'org_admin',
  organization: 'org_admin',
}

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    trackServerFlowEvent({
      flow: 'org_create',
      step: 'auth',
      status: 'failed',
      metadata: { reason: 'unauthorized' },
    })
    return jsonError('Unauthorized', 401)
  }

  const roleState = getSessionRoleState(session.user.user_metadata)
  const baseRole = roleState.baseRole || 'org_admin'

  const body = await request.json().catch(() => ({}))
  const orgName = String(body?.org_name || '').trim()
  const orgTypeInput = String(body?.org_type || 'organization').trim().toLowerCase()
  const orgType = Object.keys(ADMIN_ROLE_MAP).includes(orgTypeInput) ? orgTypeInput : 'organization'
  const orgTier = normalizeOrgTier(String(body?.tier || 'standard'))

  if (!orgName) {
    trackServerFlowEvent({
      flow: 'org_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      metadata: { reason: 'missing_org_name' },
    })
    return jsonError('org_name is required')
  }

  trackServerFlowEvent({
    flow: 'org_create',
    step: 'start',
    status: 'started',
    userId: session.user.id,
    role: baseRole,
    metadata: {
      orgType,
      orgTier,
    },
  })

  const { data: existingMembership } = await supabaseAdmin
    .from('organization_memberships')
    .select('id, org_id, role, status')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (existingMembership?.id) {
    trackServerFlowEvent({
      flow: 'org_create',
      step: 'membership_check',
      status: 'failed',
      userId: session.user.id,
      role: baseRole,
      entityId: existingMembership.org_id || null,
      metadata: { reason: 'existing_membership' },
    })
    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('id, name, org_type')
      .eq('id', existingMembership.org_id)
      .maybeSingle()

    const { data: teamRows } = await supabaseAdmin
      .from('org_team_coaches')
      .select('team_id, org_teams(id, name, org_id)')
      .eq('coach_id', session.user.id)

    const teamNames = Array.from(
      new Set(
        (teamRows || [])
          .filter((row: any) => row.org_teams?.org_id === existingMembership.org_id)
          .map((row: any) => row.org_teams?.name)
          .filter(Boolean),
      ),
    )

    return NextResponse.json(
      {
        error: 'User already has an organization.',
        org: {
          id: orgRow?.id || existingMembership.org_id,
          name: orgRow?.name || 'Organization',
          org_type: orgRow?.org_type || null,
          role: existingMembership.role || null,
          status: existingMembership.status || null,
        },
        teams: teamNames,
      },
      { status: 409 },
    )
  }

  const { data: orgRow, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({
      name: orgName,
      org_type: orgType,
    })
    .select('id, name, org_type')
    .single()

  if (orgError || !orgRow) {
    trackServerFlowFailure(orgError || new Error('Organization insert returned no row'), {
      flow: 'org_create',
      step: 'org_insert',
      userId: session.user.id,
      role: baseRole,
      metadata: { orgName, orgType, orgTier },
    })
    return safeServerError('Unable to create organization. Check production database access and organization table setup.', 500)
  }

  const membershipRole = ADMIN_ROLE_MAP[orgType] || 'org_admin'

  const { error: membershipError } = await supabaseAdmin.from('organization_memberships').insert({
    org_id: orgRow.id,
    user_id: session.user.id,
    role: membershipRole,
    status: 'active',
  })

  if (membershipError) {
    trackServerFlowFailure(membershipError, {
      flow: 'org_create',
      step: 'membership_insert',
      userId: session.user.id,
      role: baseRole,
      entityId: orgRow.id,
      metadata: { membershipRole },
    })
    return safeServerError('Organization was created, but membership setup failed. Check organization_memberships in production.', 500)
  }

  const settingsSeed = await initializeOrgSettings({
    orgId: orgRow.id,
    orgName: orgRow.name,
  })

  if (!settingsSeed.ok) {
    trackServerFlowFailure(settingsSeed.error, {
      flow: 'org_create',
      step: 'settings_seed',
      userId: session.user.id,
      role: baseRole,
      entityId: orgRow.id,
      metadata: { orgTier },
    })
    return safeServerError('Organization was created, but billing settings initialization failed. Check org_settings in production.', 500)
  }

  const nextRoles = Array.from(new Set([baseRole, ...roleState.availableRoles, membershipRole]))

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      org_name: orgRow.name,
      org_type: orgRow.org_type,
      current_org_id: orgRow.id,
      roles: nextRoles,
      active_role: membershipRole,
    },
  })
  if (metadataError) {
    trackServerFlowFailure(metadataError, {
      flow: 'org_create',
      step: 'metadata_update',
      userId: session.user.id,
      role: baseRole,
      entityId: orgRow.id,
      metadata: { membershipRole },
    })
    return safeServerError('Organization was created, but account role setup failed. Sign in again and retry checkout.', 500)
  }

  trackServerFlowEvent({
    flow: 'org_create',
    step: 'complete',
    status: 'succeeded',
    userId: session.user.id,
    role: membershipRole,
    entityId: orgRow.id,
    metadata: {
      orgType,
      orgTier,
      settingsSchemaDegraded: settingsSeed.degraded,
    },
  })

  return NextResponse.json({
    org: orgRow,
    membership_role: membershipRole,
    active_role: membershipRole,
    settings_schema_degraded: settingsSeed.degraded,
  })
}
