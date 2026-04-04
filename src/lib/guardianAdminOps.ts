import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type GuardianOpsSnapshot = {
  pending_total: number
  pending_stale_24h: number
  failed_notifications: number
  recent_approved: number
  recent_denied: number
  recent_expired: number
  approval_rate: number
}

const toIsoDaysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

export const getGuardianOpsSnapshot = async (): Promise<GuardianOpsSnapshot> => {
  const pendingSince = toIsoDaysAgo(14)
  const staleThresholdIso = toIsoDaysAgo(1)
  const recentWindowIso = toIsoDaysAgo(30)

  const { data: pendingRows } = await supabaseAdmin
    .from('guardian_approvals')
    .select('id, created_at, notification_channels')
    .eq('status', 'pending')
    .gte('created_at', pendingSince)
    .limit(1000)

  const pending = pendingRows || []
  const pendingStale = pending.filter((row) => {
    const createdAt = row.created_at ? new Date(row.created_at) : null
    return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt.toISOString() < staleThresholdIso
  }).length

  const failedNotifications = pending.filter((row) => {
    const channels = (row.notification_channels || {}) as Record<string, any>
    const email = String(channels.email || '').toLowerCase()
    const inApp = String(channels.in_app || '').toLowerCase()
    const sms = String(channels.sms || '').toLowerCase()
    const failedStatuses = new Set(['failed', 'error', 'bounced', 'dropped'])
    return failedStatuses.has(email) || failedStatuses.has(inApp) || failedStatuses.has(sms)
  }).length

  const { data: recentRows } = await supabaseAdmin
    .from('guardian_approvals')
    .select('status')
    .gte('created_at', recentWindowIso)
    .in('status', ['approved', 'denied', 'expired'])
    .limit(5000)

  const recent = recentRows || []
  const approved = recent.filter((row) => row.status === 'approved').length
  const denied = recent.filter((row) => row.status === 'denied').length
  const expired = recent.filter((row) => row.status === 'expired').length
  const resolvedTotal = approved + denied + expired
  const approvalRate = resolvedTotal ? Math.round((approved / resolvedTotal) * 1000) / 10 : 0

  return {
    pending_total: pending.length,
    pending_stale_24h: pendingStale,
    failed_notifications: failedNotifications,
    recent_approved: approved,
    recent_denied: denied,
    recent_expired: expired,
    approval_rate: approvalRate,
  }
}
