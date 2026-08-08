import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = [
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager',
]

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { invite_id: inviteId } = await request.json().catch(() => ({}))
  if (!inviteId) return NextResponse.json({ error: 'invite_id is required' }, { status: 400 })

  const { data: invite } = await supabaseAdmin.from('org_invites')
    .select('id, org_id, role, status, invited_user_id')
    .eq('id', inviteId)
    .maybeSingle()
  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })

  const { data: membership } = await supabaseAdmin.from('organization_memberships')
    .select('role, status')
    .eq('org_id', invite.org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (!membership || membership.status === 'suspended' || !ADMIN_ROLES.includes(String(membership.role || ''))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (invite.status !== 'awaiting_approval' || !invite.invited_user_id) {
    return NextResponse.json({ error: 'Invite is not ready for approval' }, { status: 409 })
  }
  return NextResponse.json({
    requiresConfirmation: false,
    amountDueNow: 0,
    billingChange: false,
    description: 'Organization coaches are included with the organization subscription.',
  })
}
