import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isPushEnabled, resolveNotificationCategory } from '@/lib/notificationPrefs'
export const dynamic = 'force-dynamic'


export async function GET() {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const { data, error: queryError } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (queryError) {
    console.error('[notifications] query error:', queryError.message)
    return jsonError('Unable to load notifications. Please try again.', 500)
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('notification_prefs,role')
    .eq('id', session.user.id)
    .maybeSingle()
  const { data: subProfileRows } = await supabaseAdmin
    .from('athlete_sub_profiles')
    .select('id, name')
    .eq('user_id', session.user.id)

  const prefs = profileRow?.notification_prefs || null
  const subProfileMap = new Map(
    ((subProfileRows || []) as Array<{ id: string; name?: string | null }>).map((row) => [row.id, row.name || 'Athlete profile']),
  )
  const orgIds = Array.from(
    new Set((data || []).map((item: any) => item?.data?.org_id).filter(Boolean))
  ) as string[]
  const { data: membershipRows } = orgIds.length
    ? await supabaseAdmin
        .from('organization_memberships')
        .select('org_id, status')
        .eq('user_id', session.user.id)
        .in('org_id', orgIds)
    : { data: [] }
  const membershipStatusMap = new Map((membershipRows || []).map((row) => [row.org_id, row.status]))
  const workspaceIds = Array.from(new Set((data || []).map((item: any) => item.workspace_id).filter(Boolean))) as string[]
  const { data: workspaceRows } = workspaceIds.length
    ? await supabaseAdmin.from('workspace_memberships').select('workspace_id,status').eq('user_id',session.user.id).in('workspace_id',workspaceIds)
    : { data: [] }
  const allowedWorkspaceIds = new Set((workspaceRows || []).filter(row => row.status === 'active').map(row => row.workspace_id))
  const isPlatformAdmin = ['admin','superadmin'].includes(String(profileRow?.role || ''))

  const notifications = (data || []).filter((item: any) => {
    if (item.expires_at && new Date(item.expires_at).getTime() <= Date.now()) return false
    if (item.workspace_id && !isPlatformAdmin && !allowedWorkspaceIds.has(item.workspace_id)) return false
    if (item?.data?.org_id) {
      const status = membershipStatusMap.get(item.data.org_id)
      if (status === 'suspended') return false
    }
    const category = resolveNotificationCategory(item.type, item?.data?.category)
    if (!category) return true
    return isPushEnabled(prefs, category)
  }).map((item: any) => {
    const nextData = { ...(item?.data || {}) } as Record<string, unknown>
    const subProfileId =
      typeof nextData.sub_profile_id === 'string' && nextData.sub_profile_id.trim()
        ? nextData.sub_profile_id.trim()
        : null
    const hasAthleteContextType = ['session_booked', 'session_payment', 'marketplace_order'].includes(String(item?.type || ''))
    const athleteLabel =
      (typeof nextData.athlete_label === 'string' && nextData.athlete_label.trim())
      || (subProfileId ? subProfileMap.get(subProfileId) : null)
      || (hasAthleteContextType ? 'Primary athlete' : null)

    if (athleteLabel) {
      nextData.athlete_label = athleteLabel
    }

    return {
      ...item,
      data: nextData,
    }
  })

  return NextResponse.json({ notifications })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { ids = [] } = body || {}

  if (!Array.isArray(ids) || ids.length === 0) {
    return jsonError('ids are required')
  }

  const safeIds = ids.slice(0, 100)

  const { error: updateError } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', session.user.id)
    .in('id', safeIds)

  if (updateError) {
    console.error('[notifications] update error:', updateError.message)
    return jsonError('Unable to mark notifications as read. Please try again.', 500)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { ids = [] } = body || {}

  if (!Array.isArray(ids) || ids.length === 0) {
    return jsonError('ids are required')
  }

  const safeIds = ids.slice(0, 100)

  const { error: deleteError } = await supabaseAdmin
    .from('notifications')
    .delete()
    .eq('user_id', session.user.id)
    .in('id', safeIds)

  if (deleteError) {
    console.error('[notifications] delete error:', deleteError.message)
    return jsonError('Unable to delete notifications. Please try again.', 500)
  }

  return NextResponse.json({ ok: true })
}
