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
    .select('notification_prefs')
    .eq('id', session.user.id)
    .maybeSingle()

  const prefs = profileRow?.notification_prefs || null
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

  const notifications = (data || []).filter((item: any) => {
    if (item?.data?.org_id) {
      const status = membershipStatusMap.get(item.data.org_id)
      if (status === 'suspended') return false
    }
    const category = resolveNotificationCategory(item.type, item?.data?.category)
    if (!category) return true
    return isPushEnabled(prefs, category)
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
