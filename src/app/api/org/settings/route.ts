import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
] as const

type OrgSettingsPayload = {
  org_name?: string
  org_type?: string
  primary_contact_email?: string
  support_phone?: string
  location?: string
  cancellation_window?: string
  reschedule_window?: string
  policy_notes?: string
  org_refund_policy?: string
  billing_contact?: string
  invoice_frequency?: string
  tax_id?: string
  billing_address?: string
  guardian_consent?: string
  eligibility_tracking?: string
  medical_clearance?: string
  communication_limits?: string
  fee_reminder_policy?: string
  plan?: string
  plan_status?: string
  season_start?: string
  season_end?: string
  brand_logo_url?: string
  brand_cover_url?: string
  brand_primary_color?: string
  brand_accent_color?: string
  stripe_account_id?: string
  portal_preferences?: Record<string, unknown>
  compliance_checklist?: Record<string, boolean>
}

const getOrgMembership = async (userId: string) => {
  return supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle()
}

const readOrgSettingsResponse = async (orgId: string, role?: string | null) => {
  const { data: settings } = await supabaseAdmin
    .from('org_settings')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name, org_type')
    .eq('id', orgId)
    .maybeSingle()

  return {
    ...(settings || {}),
    org_name: settings?.org_name || org?.name || '',
    org_type: org?.org_type || '',
    plan: settings?.plan || 'standard',
    plan_status: settings?.plan_status || 'trialing',
    role: role || null,
  }
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const membership = await getOrgMembership(session.user.id)
  if (!membership.data?.org_id) {
    return jsonError('No organization found', 404)
  }

  return NextResponse.json({
    settings: await readOrgSettingsResponse(membership.data.org_id, membership.data.role),
  })
}

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    trackServerFlowEvent({
      flow: 'org_settings_save',
      step: 'auth',
      status: 'failed',
      metadata: { reason: 'unauthorized' },
    })
    return jsonError('Unauthorized', 401)
  }

  const membership = await getOrgMembership(session.user.id)
  if (!membership.data?.org_id) {
    trackServerFlowEvent({
      flow: 'org_settings_save',
      step: 'membership_check',
      status: 'failed',
      userId: session.user.id,
      metadata: { reason: 'no_organization_found' },
    })
    return jsonError('No organization found', 404)
  }

  if (!ADMIN_ROLES.includes(membership.data.role as (typeof ADMIN_ROLES)[number])) {
    trackServerFlowEvent({
      flow: 'org_settings_save',
      step: 'role_check',
      status: 'failed',
      userId: session.user.id,
      role: membership.data.role,
      entityId: membership.data.org_id,
      metadata: { reason: 'forbidden' },
    })
    return jsonError('Forbidden', 403)
  }

  const payload = (await request.json().catch(() => ({}))) as OrgSettingsPayload
  const payloadKeys = Object.keys(payload)

  if (payloadKeys.length === 0) {
    trackServerFlowEvent({
      flow: 'org_settings_save',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role: membership.data.role,
      entityId: membership.data.org_id,
      metadata: { reason: 'empty_payload' },
    })
    return jsonError('No org settings fields were provided')
  }

  trackServerFlowEvent({
    flow: 'org_settings_save',
    step: 'write',
    status: 'started',
    userId: session.user.id,
    role: membership.data.role,
    entityId: membership.data.org_id,
    metadata: { keys: payloadKeys },
  })

  if (payload.org_name) {
    const { error: orgNameError } = await supabaseAdmin
      .from('organizations')
      .update({ name: payload.org_name })
      .eq('id', membership.data.org_id)
    if (orgNameError) {
      trackServerFlowFailure(orgNameError, {
        flow: 'org_settings_save',
        step: 'org_name_update',
        userId: session.user.id,
        role: membership.data.role,
        entityId: membership.data.org_id,
        metadata: { org_name: payload.org_name },
      })
      return jsonError(orgNameError.message, 500)
    }
  }

  if (payload.org_type) {
    const { error: orgTypeError } = await supabaseAdmin
      .from('organizations')
      .update({ org_type: payload.org_type })
      .eq('id', membership.data.org_id)
    if (orgTypeError) {
      trackServerFlowFailure(orgTypeError, {
        flow: 'org_settings_save',
        step: 'org_type_update',
        userId: session.user.id,
        role: membership.data.role,
        entityId: membership.data.org_id,
        metadata: { org_type: payload.org_type },
      })
      return jsonError(orgTypeError.message, 500)
    }
  }

  const { data, error } = await supabaseAdmin
    .from('org_settings')
    .upsert({
      org_id: membership.data.org_id,
      ...payload,
    }, { onConflict: 'org_id' })
    .select('*')
    .single()

  if (error) {
    trackServerFlowFailure(error, {
      flow: 'org_settings_save',
      step: 'settings_upsert',
      userId: session.user.id,
      role: membership.data.role,
      entityId: membership.data.org_id,
      metadata: { keys: payloadKeys },
    })
    return jsonError(error.message, 500)
  }

  const settings = await readOrgSettingsResponse(membership.data.org_id, membership.data.role)

  trackServerFlowEvent({
    flow: 'org_settings_save',
    step: 'write',
    status: 'succeeded',
    userId: session.user.id,
    role: membership.data.role,
    entityId: membership.data.org_id,
    metadata: {
      keys: payloadKeys,
      savedOrgSettingsId: data?.org_id || membership.data.org_id,
    },
  })

  return NextResponse.json({ settings })
}
