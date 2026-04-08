import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRoleState } from '@/lib/sessionRoleState'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return jsonError('Unauthorized', 401)
  }

  const roleState = getSessionRoleState(session.user.user_metadata)
  const roles = new Set<string>(roleState.availableRoles)

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role, status')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (membership?.role && membership.status !== 'suspended') {
    roles.add(membership.role)
  }

  return NextResponse.json({
    base_role: roleState.baseRole,
    active_role: roleState.currentRole,
    roles: Array.from(roles),
  })
}
