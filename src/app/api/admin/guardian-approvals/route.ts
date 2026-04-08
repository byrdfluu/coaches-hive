import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import type { Session } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendTransactionalEmail } from '@/lib/email'
import { logAdminAction } from '@/lib/auditLog'
import { queueOperationTaskSafely } from '@/lib/operations'
import { GUARDIAN_SCOPE_LABEL, normalizeGuardianScope } from '@/lib/guardianApproval'
import { hasAdminPermission, resolveAdminAccess, type AdminPermission, type AdminTeamRole } from '@/lib/adminRoles'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async (permission: AdminPermission): Promise<
  | { response: NextResponse; session: null; teamRole: null }
  | { response: null; session: Session; teamRole: AdminTeamRole }
> => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { response: jsonError('Unauthorized', 401), session: null, teamRole: null }
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (!adminAccess.teamRole) {
    return { response: jsonError('Forbidden', 403), session: null, teamRole: null }
  }
  const teamRole = adminAccess.teamRole
  if (!hasAdminPermission(teamRole, permission)) {
    return { response: jsonError('Forbidden', 403), session: null, teamRole: null }
  }

  return { response: null, session, teamRole }
}

const toMap = <T extends { id: string }>(rows: T[] = []) =>
  rows.reduce<Record<string, T>>((acc, row) => {
    acc[row.id] = row
    return acc
  }, {})

export async function GET(request: Request) {
  const { response, teamRole } = await requireAdmin('support.read')
  if (response) return response

  const { searchParams } = new URL(request.url)
  const status = String(searchParams.get('status') || 'all').trim().toLowerCase()
  const scope = String(searchParams.get('scope') || 'all').trim().toLowerCase()
  const targetType = String(searchParams.get('target_type') || 'all').trim().toLowerCase()
  const query = String(searchParams.get('query') || '').trim().toLowerCase()
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 200), 1), 500)

  let approvalsQuery = supabaseAdmin
    .from('guardian_approvals')
    .select(
      'id, athlete_id, guardian_user_id, guardian_name, guardian_email, guardian_phone, target_type, target_id, target_label, scope, status, created_at, responded_at, expires_at, approval_token, notification_channels',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (['pending', 'approved', 'denied', 'expired'].includes(status)) {
    approvalsQuery = approvalsQuery.eq('status', status)
  }
  if (['messages', 'transactions'].includes(scope)) {
    approvalsQuery = approvalsQuery.eq('scope', scope)
  }
  if (['coach', 'org', 'team'].includes(targetType)) {
    approvalsQuery = approvalsQuery.eq('target_type', targetType)
  }

  const { data: rows, error: fetchError } = await approvalsQuery
  if (fetchError) {
    return jsonError(fetchError.message, 500)
  }

  const approvals = rows || []
  const athleteIds = Array.from(new Set(approvals.map((row) => row.athlete_id).filter(Boolean)))
  const guardianIds = Array.from(new Set(approvals.map((row) => row.guardian_user_id).filter(Boolean)))

  const { data: athleteProfiles } = athleteIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', athleteIds)
    : { data: [] }

  const { data: guardianProfiles } = guardianIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', guardianIds)
    : { data: [] }

  const athleteMap = toMap((athleteProfiles || []) as Array<{ id: string; full_name?: string | null; email?: string | null }>)
  const guardianMap = toMap((guardianProfiles || []) as Array<{ id: string; full_name?: string | null; email?: string | null }>)

  const enriched = approvals
    .map((approval) => {
      const athlete = athleteMap[approval.athlete_id] || null
      const guardian = approval.guardian_user_id ? guardianMap[approval.guardian_user_id] : null
      return {
        ...approval,
        scope: normalizeGuardianScope(approval.scope),
        athlete_name: athlete?.full_name || 'Athlete',
        athlete_email: athlete?.email || null,
        guardian_display_name: guardian?.full_name || approval.guardian_name || null,
        guardian_display_email: guardian?.email || approval.guardian_email || null,
      }
    })
    .filter((approval) => {
      if (!query) return true
      const haystack = [
        approval.athlete_name,
        approval.athlete_email,
        approval.guardian_display_name,
        approval.guardian_display_email,
        approval.target_label,
        approval.target_type,
        approval.status,
        approval.scope,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
      return haystack.includes(query)
    })

  const summary = {
    total: enriched.length,
    pending: enriched.filter((row) => row.status === 'pending').length,
    approved: enriched.filter((row) => row.status === 'approved').length,
    denied: enriched.filter((row) => row.status === 'denied').length,
    expired: enriched.filter((row) => row.status === 'expired').length,
    messages: enriched.filter((row) => row.scope === 'messages').length,
    transactions: enriched.filter((row) => row.scope === 'transactions').length,
  }

  return NextResponse.json({
    approvals: enriched,
    summary,
    permissions: {
      can_manage: hasAdminPermission(teamRole, 'support.manage'),
    },
  })
}

export async function POST(request: Request) {
  const { response, session } = await requireAdmin('support.manage')
  if (response || !session) return response ?? jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '').trim().toLowerCase()
  const approvalId = String(body?.approval_id || '').trim()
  const reason = String(body?.reason || '').trim() || null

  if (!approvalId) return jsonError('approval_id is required')
  if (!['approve', 'deny', 'expire', 'resend'].includes(action)) {
    return jsonError('Unsupported action')
  }

  const { data: approval } = await supabaseAdmin
    .from('guardian_approvals')
    .select(
      'id, athlete_id, guardian_user_id, guardian_name, guardian_email, guardian_phone, target_type, target_id, target_label, scope, status, created_at, expires_at, approval_token, notification_channels',
    )
    .eq('id', approvalId)
    .maybeSingle()

  if (!approval) return jsonError('Approval request not found', 404)

  const approvalScope = normalizeGuardianScope(approval.scope)
  const scopeLabel = GUARDIAN_SCOPE_LABEL[approvalScope]

  const { data: athleteProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', approval.athlete_id)
    .maybeSingle()

  if (action === 'resend') {
    const origin = new URL(request.url).origin
    const actionUrl = `${origin}/guardian-approvals?token=${approval.approval_token}`

    if (approval.guardian_user_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: approval.guardian_user_id,
        type: 'guardian_approval_request',
        title: 'Guardian approval reminder',
        body: `${athleteProfile?.full_name || 'Athlete'} still needs your approval for ${scopeLabel} with ${approval.target_label || 'this request'}.`,
        action_url: actionUrl,
        data: {
          approval_id: approval.id,
          target_type: approval.target_type,
          target_id: approval.target_id,
          approval_scope: approvalScope,
          category: approvalScope === 'messages' ? 'Messages' : 'Payments',
        },
      })
    }

    if (approval.guardian_email) {
      const emailResult = await sendTransactionalEmail({
        toEmail: approval.guardian_email,
        toName: approval.guardian_name || null,
        subject:
          approvalScope === 'messages'
            ? 'Reminder: athlete messaging approval needed'
            : 'Reminder: athlete booking and payment approval needed',
        templateAlias: 'guardian_approval_request',
        tag: 'guardian_approval_request',
        templateModel: {
          athlete_name: athleteProfile?.full_name || 'Athlete',
          action_url: actionUrl,
          message_preview: `${athleteProfile?.full_name || 'Athlete'} still needs your approval for ${scopeLabel} with ${approval.target_label || 'this request'}.`,
        },
        metadata: {
          approval_id: approval.id,
          target_type: approval.target_type,
          target_id: approval.target_id,
          scope: approvalScope,
          action: 'resend',
        },
      })

      const emailStatus = emailResult.status === 'sent' ? 'sent' : emailResult.status
      const nextChannels = {
        ...((approval.notification_channels || {}) as Record<string, any>),
        email: emailStatus,
      }

      await supabaseAdmin
        .from('guardian_approvals')
        .update({ notification_channels: nextChannels })
        .eq('id', approval.id)

      if (emailStatus !== 'sent') {
        await queueOperationTaskSafely({
          type: 'support_followup',
          title: 'Guardian approval email resend failed',
          priority: 'high',
          owner: 'Support Ops',
          entity_type: 'guardian_approval',
          entity_id: approval.id,
          idempotency_key: `guardian_resend_failure:${approval.id}`,
          last_error: `email status: ${emailStatus}`,
          metadata: {
            action: 'resend',
            approval_scope: approvalScope,
          },
        })
      }
    }

    await logAdminAction({
      action: 'admin.guardian_approvals.resend',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'guardian_approval',
      targetId: approval.id,
      metadata: {
        reason,
        scope: approvalScope,
        status_before: approval.status,
      },
    })

    return NextResponse.json({ ok: true, status: approval.status, resent: true })
  }

  if (action !== 'resend' && approval.status !== 'pending') {
    return jsonError('Approval request is not pending.', 409)
  }

  const nextStatus = action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : 'expired'
  await supabaseAdmin
    .from('guardian_approvals')
    .update({ status: nextStatus, responded_at: new Date().toISOString() })
    .eq('id', approval.id)

  if (action === 'approve' && approval.guardian_user_id) {
    await supabaseAdmin
      .from('guardian_athlete_links')
      .upsert(
        {
          guardian_user_id: approval.guardian_user_id,
          athlete_id: approval.athlete_id,
          relationship: 'parent',
          status: 'active',
          created_by: session.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guardian_user_id,athlete_id' },
      )
  }

  if (action === 'approve' && approval.target_type === 'coach') {
    const { data: existingLink } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('id')
      .eq('coach_id', approval.target_id)
      .eq('athlete_id', approval.athlete_id)
      .maybeSingle()

    if (!existingLink) {
      await supabaseAdmin.from('coach_athlete_links').insert({
        coach_id: approval.target_id,
        athlete_id: approval.athlete_id,
        status: 'active',
      })
    }
  }

  await supabaseAdmin.from('notifications').insert({
    user_id: approval.athlete_id,
    type: action === 'approve' ? 'guardian_approval_granted' : 'guardian_approval_denied',
    title: action === 'approve' ? 'Guardian approved your request' : 'Guardian denied your request',
    body:
      action === 'approve'
        ? `You can now use ${scopeLabel} with ${approval.target_label || 'this contact'}.`
        : `Your request for ${scopeLabel} with ${approval.target_label || 'this contact'} was ${nextStatus}.`,
    action_url: approvalScope === 'messages' ? '/athlete/messages' : '/athlete/calendar',
    data: {
      approval_id: approval.id,
      approval_scope: approvalScope,
      category: approvalScope === 'messages' ? 'Messages' : 'Payments',
    },
  })

  if (athleteProfile?.email) {
    await sendTransactionalEmail({
      toEmail: athleteProfile.email,
      toName: athleteProfile.full_name || null,
      subject: action === 'approve' ? 'Guardian approved your request' : 'Guardian request updated',
      templateAlias: action === 'approve' ? 'guardian_approved' : 'guardian_declined',
      tag: action === 'approve' ? 'guardian_approved' : 'guardian_declined',
      templateModel: {
        dashboard_url: `${new URL(request.url).origin}${approvalScope === 'messages' ? '/athlete/messages' : '/athlete/calendar'}`,
        athlete_name: athleteProfile.full_name || 'Athlete',
        message_preview:
          action === 'approve'
            ? `Your guardian approved ${scopeLabel} for ${approval.target_label || 'this request'}.`
            : `Your guardian response for ${scopeLabel} with ${approval.target_label || 'this request'} is ${nextStatus}.`,
      },
      metadata: {
        approval_id: approval.id,
        action,
        scope: approvalScope,
      },
    })
  }

  await logAdminAction({
    action: `admin.guardian_approvals.${action}`,
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'guardian_approval',
    targetId: approval.id,
    metadata: {
      reason,
      scope: approvalScope,
      status_before: approval.status,
      status_after: nextStatus,
    },
  })

  return NextResponse.json({ ok: true, status: nextStatus })
}
