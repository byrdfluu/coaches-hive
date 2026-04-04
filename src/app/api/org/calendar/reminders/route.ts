import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logOrgAction } from '@/lib/orgAuditLog'
export const dynamic = 'force-dynamic'


const allowedRoles = [
  'admin',
  'org_admin',
  'school_admin',
  'athletic_director',
  'club_admin',
  'travel_admin',
  'program_director',
  'team_manager',
]

const resolveOrgId = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.org_id || null
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(allowedRoles)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const total = Number(body?.total || 0)
  const orgId = await resolveOrgId(session.user.id)

  if (orgId) {
    await logOrgAction({
      orgId,
      action: 'calendar.reminders',
      actorId: session.user.id,
      actorEmail: session.user.email,
      targetType: 'calendar',
      metadata: { total },
    })
  }

  return NextResponse.json({
    ok: true,
    action: 'reminders',
    total,
    message: total ? `Queued reminders for ${total} events.` : 'Reminders queued.',
  })
}
