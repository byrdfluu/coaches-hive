import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return jsonError('Forbidden', 403)
  }

  const { data: orgRows, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })

  if (orgError) {
    return jsonError(orgError.message)
  }

  const orgs = (orgRows || []) as Array<Record<string, any>>
  const orgIds = orgs.map((org) => org.id).filter(Boolean)

  if (orgIds.length === 0) {
    return NextResponse.json({ orgs: [] })
  }

  const { data: membershipRows, error: membershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id, user_id, role, created_at')
    .in('org_id', orgIds)

  if (membershipError) {
    return jsonError(membershipError.message)
  }

  const { data: settingsRows, error: settingsError } = await supabaseAdmin
    .from('org_settings')
    .select('*')
    .in('org_id', orgIds)

  if (settingsError) {
    return jsonError(settingsError.message)
  }

  const settingsByOrg = new Map<string, Record<string, any>>()
  ;(settingsRows || []).forEach((row) => {
    if (row.org_id) settingsByOrg.set(row.org_id, row)
  })

  const memberCounts = new Map<string, number>()
  const membershipActivity = new Map<string, string>()
  ;(membershipRows || []).forEach((row: { org_id?: string | null; created_at?: string | null }) => {
    if (!row.org_id) return
    memberCounts.set(row.org_id, (memberCounts.get(row.org_id) || 0) + 1)
    if (row.created_at) {
      const prev = membershipActivity.get(row.org_id)
      if (!prev || new Date(row.created_at) > new Date(prev)) {
        membershipActivity.set(row.org_id, row.created_at)
      }
    }
  })

  const response = orgs.map((org) => {
    const settings = settingsByOrg.get(org.id) || {}
    const memberCount = memberCounts.get(org.id) || 0
    const status = org.status || settings.status || (memberCount > 0 ? 'Active' : 'Pending')
    const plan = org.plan || settings.plan || settings.invoice_frequency || 'Not set'
    const activityCandidates = [
      settings.updated_at,
      org.updated_at,
      membershipActivity.get(org.id),
      org.created_at,
    ].filter(Boolean) as string[]
    const lastActivityAt =
      activityCandidates.length > 0
        ? activityCandidates.reduce((latest, value) =>
            new Date(value) > new Date(latest) ? value : latest
          )
        : null

    return {
      id: org.id,
      name: org.name || settings.org_name || 'Organization',
      status,
      plan,
      member_count: memberCount,
      last_activity_at: lastActivityAt,
    }
  })

  return NextResponse.json({ orgs: response })
}
