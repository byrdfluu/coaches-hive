import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { hashInviteToken } from '@/lib/inviteTokens'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  let { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (token) {
      const { data } = await supabaseAdmin.auth.getUser(token)
      if (data.user) session = { user: data.user } as typeof session
    }
  }
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const inviteToken = String(body?.invite_token || '').trim()
  if (!inviteToken) return NextResponse.json({ error: 'invite_token is required' }, { status: 400 })
  const email = String(session.user.email || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Authenticated email is required' }, { status: 422 })
  const args = { p_token_hash: hashInviteToken(inviteToken), p_user_id: session.user.id, p_user_email: email }

  const coachResult = await supabaseAdmin.rpc('accept_org_invitation_token_server', args)
  if (!coachResult.error) {
    const row = coachResult.data?.[0]
    return NextResponse.json({ status: 'accepted', invitation_type: 'organization', organization_id: row?.organization_id, role: row?.invitation_role })
  }
  const guardianResult = await supabaseAdmin.rpc('accept_guardian_invitation_token_server', args)
  if (!guardianResult.error) {
    const row = guardianResult.data?.[0]
    return NextResponse.json({ status: 'accepted', invitation_type: 'guardian', organization_id: row?.organization_id, athlete_id: row?.athlete_id })
  }
  return NextResponse.json({ error: 'Invitation not found, expired, already used, or assigned to another email.' }, { status: 410 })
}
