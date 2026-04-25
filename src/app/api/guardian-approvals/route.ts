import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { hasSupabaseAdminConfig, supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendTransactionalEmail } from '@/lib/email'
import { GUARDIAN_SCOPE_LABEL, normalizeGuardianScope } from '@/lib/guardianApproval'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const jsonPublicServerError = (message: string, status = 503) =>
  NextResponse.json({ error: message }, { status })

const normalizeName = (value?: string | null) =>
  value && value.trim().length ? value.trim() : 'Athlete'

const normalizeApprovalAction = (value: unknown): 'approve' | 'deny' | null => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'approve' || normalized === 'approved') return 'approve'
  if (normalized === 'deny' || normalized === 'denied') return 'deny'
  return null
}

export async function GET(request: Request) {
  if (!hasSupabaseAdminConfig) {
    return jsonPublicServerError(
      'Guardian approvals are temporarily unavailable. Please try again shortly.',
      503,
    )
  }

  const url = new URL(request.url)
  const token = url.searchParams.get('token')

  if (token) {
    const { data: approval } = await supabaseAdmin
      .from('guardian_approvals')
      .select('id, athlete_id, guardian_user_id, guardian_email, target_type, target_id, target_label, scope, status, created_at, expires_at')
      .eq('approval_token', token)
      .maybeSingle()
    if (!approval) return jsonError('Approval request not found', 404)
    if (approval.expires_at && new Date(approval.expires_at).getTime() < Date.now()) {
      return jsonError('Approval request expired', 410)
    }

    const [{ data: athlete }] = await Promise.all([
      supabaseAdmin.from('profiles').select('full_name').eq('id', approval.athlete_id).maybeSingle(),
    ])

    // If guardian_user_id is null, check whether the guardian has created an account yet
    let guardianNeedsAccount = false
    if (!approval.guardian_user_id && approval.guardian_email) {
      const { data: guardianProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', approval.guardian_email)
        .maybeSingle()
      if (!guardianProfile) {
        guardianNeedsAccount = true
      }
    }

    return NextResponse.json({
      approval: {
        ...approval,
        athlete_name: athlete?.full_name || 'Athlete',
        guardian_needs_account: guardianNeedsAccount,
      },
    })
  }

  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) {
    return jsonError('Unauthorized', 401)
  }

  const email = session.user.email || ''
  const { data: approvals } = await supabaseAdmin
    .from('guardian_approvals')
    .select('id, athlete_id, target_type, target_id, target_label, scope, status, created_at')
    .or(`guardian_user_id.eq.${session.user.id},guardian_email.eq.${email},athlete_id.eq.${session.user.id}`)
    .order('created_at', { ascending: false })

  const athleteIds = Array.from(new Set((approvals || []).map((item) => item.athlete_id)))
  const { data: athletes } = athleteIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', athleteIds)
    : { data: [] }
  const athleteMap = new Map<string, { full_name?: string | null }>()
  ;(athletes || []).forEach((athlete) => athleteMap.set(athlete.id, athlete))

  return NextResponse.json({
    approvals: (approvals || []).map((item) => ({
      ...item,
      athlete_name: athleteMap.get(item.athlete_id)?.full_name || 'Athlete',
    })),
  })
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig) {
    return jsonPublicServerError(
      'Guardian approvals are temporarily unavailable. Please try again shortly.',
      503,
    )
  }

  const body = await request.json().catch(() => ({}))
  const { approval_id, token } = body || {}
  const action = normalizeApprovalAction(body?.action ?? body?.decision)

  if (!action) {
    trackServerFlowEvent({
      flow: 'guardian_approval_respond',
      step: 'validate',
      status: 'failed',
      metadata: {
        reason: 'invalid_action',
        action: String(body?.action || '') || null,
        decision: String(body?.decision || '') || null,
      },
    })
    return jsonError('action must be approve or deny')
  }

  let approval:
    | {
        id: string
        athlete_id: string
        guardian_user_id: string | null
        guardian_email: string | null
        target_type: string
        target_id: string
        target_label: string | null
        scope: string | null
        status: string
      }
    | null = null

  if (token) {
    const { data } = await supabaseAdmin
      .from('guardian_approvals')
      .select('id, athlete_id, guardian_user_id, guardian_email, target_type, target_id, target_label, scope, status, expires_at')
      .eq('approval_token', token)
      .maybeSingle()
    if (!data) return jsonError('Approval request not found', 404)
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return jsonError('Approval request expired', 410)
    }

    // If the guardian hasn't created an account yet, block the approval so no
    // orphaned approval record is created (guardian_user_id would remain null
    // and guardian_athlete_links would never be written).
    if (!data.guardian_user_id && data.guardian_email) {
      const { data: guardianProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', data.guardian_email)
        .maybeSingle()
      if (!guardianProfile) {
        return jsonError('Please accept your guardian account invite before reviewing this request.', 403)
      }
      // Guardian now has an account — patch the approval record so future
      // authenticated lookups work correctly.
      await supabaseAdmin
        .from('guardian_approvals')
        .update({ guardian_user_id: guardianProfile.id })
        .eq('id', data.id)
      data.guardian_user_id = guardianProfile.id
    }

    approval = data
  } else {
    const supabase = await createRouteHandlerClientCompat()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) {
      return jsonError('Unauthorized', 401)
    }

    const { data } = await supabaseAdmin
      .from('guardian_approvals')
      .select('id, athlete_id, guardian_user_id, guardian_email, target_type, target_id, target_label, scope, status')
      .eq('id', approval_id)
      .maybeSingle()
    if (!data) return jsonError('Approval request not found', 404)

    const email = session.user.email || ''
    const authorized =
      data.guardian_user_id === session.user.id || (data.guardian_email && data.guardian_email === email)
    if (!authorized) {
      return jsonError('Forbidden', 403)
    }
    approval = data
  }

  if (!approval) {
    return jsonError('Approval request not found', 404)
  }

  if (approval.status !== 'pending') {
    trackServerFlowEvent({
      flow: 'guardian_approval_respond',
      step: 'approval_check',
      status: 'failed',
      entityId: approval.id,
      metadata: { reason: 'already_handled', status: approval.status },
    })
    return jsonError('Approval request already handled', 409)
  }

  trackServerFlowEvent({
    flow: 'guardian_approval_respond',
    step: 'write',
    status: 'started',
    userId: approval.guardian_user_id,
    role: 'guardian',
    entityId: approval.id,
    metadata: {
      action,
      athleteId: approval.athlete_id,
      targetType: approval.target_type,
      targetId: approval.target_id,
    },
  })

  // Create links first — update approval status only after all writes succeed.
  // If links fail and we return 500, the approval stays 'pending' and the guardian can retry.
  // Updating status first would leave it stuck as 'approved' with no link if a subsequent write fails.

  if (action === 'approve' && approval.guardian_user_id) {
    const { error: guardianLinkError } = await supabaseAdmin
      .from('guardian_athlete_links')
      .upsert(
        {
          guardian_user_id: approval.guardian_user_id,
          athlete_id: approval.athlete_id,
          relationship: 'parent',
          status: 'active',
          created_by: approval.athlete_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guardian_user_id,athlete_id' },
      )
    if (guardianLinkError) {
      trackServerFlowFailure(guardianLinkError, {
        flow: 'guardian_approval_respond',
        step: 'guardian_link_upsert',
        userId: approval.guardian_user_id,
        role: 'guardian',
        entityId: approval.id,
        metadata: { athleteId: approval.athlete_id },
      })
      return jsonError(guardianLinkError.message, 500)
    }
  }

  if (action === 'approve' && approval.target_type === 'coach') {
    const { data: existingLink } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('id')
      .eq('coach_id', approval.target_id)
      .eq('athlete_id', approval.athlete_id)
      .maybeSingle()
    if (!existingLink) {
      const { error: coachLinkError } = await supabaseAdmin.from('coach_athlete_links').insert({
        coach_id: approval.target_id,
        athlete_id: approval.athlete_id,
        status: 'active',
      })
      if (coachLinkError) {
        trackServerFlowFailure(coachLinkError, {
          flow: 'guardian_approval_respond',
          step: 'coach_link_insert',
          userId: approval.guardian_user_id,
          role: 'guardian',
          entityId: approval.id,
          metadata: { athleteId: approval.athlete_id, coachId: approval.target_id },
        })
        return jsonError(coachLinkError.message, 500)
      }
    }
  }

  const { error: approvalUpdateError } = await supabaseAdmin
    .from('guardian_approvals')
    .update({
      status: action === 'approve' ? 'approved' : 'denied',
      responded_at: new Date().toISOString(),
    })
    .eq('id', approval.id)

  if (approvalUpdateError) {
    trackServerFlowFailure(approvalUpdateError, {
      flow: 'guardian_approval_respond',
      step: 'approval_update',
      userId: approval.guardian_user_id,
      role: 'guardian',
      entityId: approval.id,
      metadata: { action },
    })
    return jsonError(approvalUpdateError.message, 500)
  }

  const { data: athlete } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email')
    .eq('id', approval.athlete_id)
    .maybeSingle()

  const approvalScope = normalizeGuardianScope(approval.scope)
  const isMessagingScope = approvalScope === 'messages'
  const approvalSubject = GUARDIAN_SCOPE_LABEL[approvalScope]
  const athleteActionUrl = isMessagingScope ? '/athlete/messages' : '/athlete/calendar'

  await supabaseAdmin.from('notifications').insert({
    user_id: approval.athlete_id,
    type: action === 'approve' ? 'guardian_approval_granted' : 'guardian_approval_denied',
    title: action === 'approve' ? 'Guardian approved your request' : 'Guardian denied your request',
    body: action === 'approve'
      ? `You can now use ${approvalSubject} with ${approval.target_label || 'this contact'}.`
      : `Your request for ${approvalSubject} with ${approval.target_label || 'this contact'} was denied.`,
    action_url: athleteActionUrl,
    data: {
      category: isMessagingScope ? 'Messages' : 'Payments',
      approval_id: approval.id,
      approval_scope: approvalScope,
    },
  })

  if (athlete?.email) {
    const origin = new URL(request.url).origin
    const dashboardUrl = `${origin}${athleteActionUrl}`
    const approved = action === 'approve'
    await sendTransactionalEmail({
      toEmail: athlete.email,
      toName: athlete.full_name || null,
      subject: approved ? 'Guardian approved your request' : 'Guardian denied your request',
      templateAlias: approved ? 'guardian_approved' : 'guardian_declined',
      tag: approved ? 'guardian_approved' : 'guardian_declined',
      templateModel: {
        dashboard_url: dashboardUrl,
        athlete_name: normalizeName(athlete.full_name),
        message_preview: `Your guardian ${approved ? 'approved' : 'denied'} your request for ${approvalSubject} with ${approval.target_label || 'this contact'}.`,
      },
      metadata: { approval_id: approval.id, action, scope: approvalScope },
    })
  }

  trackServerFlowEvent({
    flow: 'guardian_approval_respond',
    step: 'write',
    status: 'succeeded',
    userId: approval.guardian_user_id,
    role: 'guardian',
    entityId: approval.id,
    metadata: {
      action,
      athleteId: approval.athlete_id,
      targetType: approval.target_type,
      targetId: approval.target_id,
      scope: approvalScope,
    },
  })

  return NextResponse.json({ status: action === 'approve' ? 'approved' : 'denied' })
}
