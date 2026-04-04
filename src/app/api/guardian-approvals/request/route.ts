import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendTransactionalEmail } from '@/lib/email'
import {
  GUARDIAN_SCOPE_LABEL,
  checkGuardianApproval,
  normalizeGuardianScope,
  resolveGuardianUserIdForAthlete,
  type GuardianApprovalTargetType,
} from '@/lib/guardianApproval'
import crypto from 'crypto'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const normalizeTargetLabel = (value?: string | null) =>
  value && value.trim().length ? value.trim() : 'this request'

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return jsonError('Unauthorized', 401)
  }

  const body = await request.json().catch(() => ({}))
  const { target_type, target_id, target_label } = body || {}
  const scope = normalizeGuardianScope(body?.scope)

  if (!['coach', 'org', 'team'].includes(target_type)) {
    return jsonError('target_type must be coach, org, or team')
  }

  if (!target_id) {
    return jsonError('target_id is required')
  }
  const normalizedTargetType = target_type as GuardianApprovalTargetType
  const normalizedTargetId = String(target_id)

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, guardian_name, guardian_email, guardian_phone, guardian_approval_rule, account_owner_type')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!profile) {
    return jsonError('Athlete profile not found', 404)
  }

  if (profile.account_owner_type === 'guardian') {
    return jsonError('Guardian accounts can approve directly.', 409)
  }

  if (profile.guardian_approval_rule === 'none') {
    return jsonError('Guardian approval not required.', 409)
  }

  if (!profile.guardian_email && !profile.guardian_phone) {
    return jsonError('Guardian contact info is missing.')
  }

  const approvalState = await checkGuardianApproval({
    athleteId: profile.id,
    targetType: normalizedTargetType,
    targetId: normalizedTargetId,
    scope,
  })

  if (approvalState.allowed) {
    return NextResponse.json({
      status: 'approved',
      scope,
      id: approvalState.approvalId || null,
    })
  }

  const { data: existing } = await supabaseAdmin
    .from('guardian_approvals')
    .select('id, status')
    .eq('athlete_id', profile.id)
    .eq('target_type', normalizedTargetType)
    .eq('target_id', normalizedTargetId)
    .eq('scope', scope)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing?.id) {
    return NextResponse.json({ status: 'pending', scope, id: existing.id })
  }

  const guardianUserId = await resolveGuardianUserIdForAthlete(profile.id, profile)

  const approvalToken = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const channels = {
    in_app: guardianUserId ? 'queued' : 'skipped',
    email: profile.guardian_email ? 'queued' : 'skipped',
    sms: profile.guardian_phone ? 'queued' : 'skipped',
  }

  const { data: approval } = await supabaseAdmin
    .from('guardian_approvals')
    .insert({
      athlete_id: profile.id,
      guardian_user_id: guardianUserId,
      guardian_name: profile.guardian_name,
      guardian_email: profile.guardian_email,
      guardian_phone: profile.guardian_phone,
      target_type: normalizedTargetType,
      target_id: normalizedTargetId,
      target_label: target_label || null,
      scope,
      approval_token: approvalToken,
      expires_at: expiresAt,
      requested_by: profile.id,
      notification_channels: channels,
    })
    .select('id')
    .maybeSingle()

  if (!approval?.id) {
    return jsonError('Unable to create approval request', 500)
  }

  const origin = new URL(request.url).origin
  const actionUrl = `${origin}/guardian-approvals?token=${approvalToken}`

  if (guardianUserId) {
    await supabaseAdmin.from('notifications').insert({
      user_id: guardianUserId,
      type: 'guardian_approval_request',
      title: 'Guardian approval needed',
      body: `${profile.full_name || 'An athlete'} requested approval for ${GUARDIAN_SCOPE_LABEL[scope]} with ${normalizeTargetLabel(target_label)}.`,
      action_url: actionUrl,
      data: {
        approval_id: approval.id,
        target_type: normalizedTargetType,
        target_id: normalizedTargetId,
        approval_scope: scope,
        category: scope === 'messages' ? 'Messages' : 'Payments',
      },
    })
  }

  if (profile.guardian_email) {
    const scopeLabel = GUARDIAN_SCOPE_LABEL[scope]
    const emailResult = await sendTransactionalEmail({
      toEmail: profile.guardian_email,
      toName: profile.guardian_name || null,
      subject:
        scope === 'messages'
          ? 'Approval needed for athlete messaging'
          : 'Approval needed for athlete booking and payments',
      templateAlias: 'guardian_approval_request',
      tag: 'guardian_approval_request',
      templateModel: {
        athlete_name: profile.full_name || 'Athlete',
        action_url: actionUrl,
        message_preview: `${profile.full_name || 'An athlete'} requested approval for ${scopeLabel} with ${normalizeTargetLabel(target_label)}.`,
      },
      metadata: { approval_id: approval.id, target_type: normalizedTargetType, target_id: normalizedTargetId, scope },
    })

    const emailStatus = emailResult.status === 'sent' ? 'sent' : emailResult.status
    await supabaseAdmin
      .from('guardian_approvals')
      .update({
        notification_channels: { ...channels, email: emailStatus },
      })
      .eq('id', approval.id)
  }

  return NextResponse.json({ status: 'pending', scope, id: approval.id })
}
