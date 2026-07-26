import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { headers } from 'next/headers'
import { getPostHogClient } from '@/lib/posthog-server'

export const dynamic = 'force-dynamic'

const missingCoachWaiverTables = (message?: string | null) =>
  /coach_waivers|coach_waiver_assignments|schema cache|relation .* does not exist|table .* does not exist/i.test(String(message || ''))

// POST /api/waivers/sign — athlete signs an org waiver or coach-sent waiver assignment
export async function POST(request: Request) {
  const { supabase, session, error } = await getSessionRole()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const waiverId = String(body?.waiver_id || '').trim()
  const assignmentId = String(body?.assignment_id || '').trim()
  const fullName = String(body?.full_name || '').trim()

  if (!waiverId && !assignmentId) return jsonError('waiver_id or assignment_id is required')
  if (!fullName) return jsonError('full_name is required')

  const userId = session.user.id
  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    null

  if (assignmentId) {
    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('coach_waiver_assignments')
      .select('id, waiver_id, athlete_id, signed_at')
      .eq('id', assignmentId)
      .maybeSingle()

    if (assignmentError) {
      if (missingCoachWaiverTables(assignmentError.message)) {
        return jsonError('Coach waiver tables are not installed.', 503)
      }
      return jsonError('Internal server error', 500)
    }
    if (!assignment) return jsonError('Waiver assignment not found', 404)
    if (assignment.athlete_id !== userId) return jsonError('Forbidden', 403)
    if (assignment.signed_at) return jsonError('You have already signed this waiver', 409)

    const { data: waiver } = await supabaseAdmin
      .from('coach_waivers')
      .select('id, title, is_active')
      .eq('id', assignment.waiver_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!waiver) return jsonError('Waiver not found or no longer active', 404)

    // The database RPC creates the proof once and its trigger makes the signed
    // snapshot immutable. Web code must never rewrite signed proof fields.
    const { data: signedAssignment, error: updateError } = await supabase
      .rpc('sign_coach_waiver_immutable', {
        assignment_id: assignmentId,
        signer_name: fullName,
      })

    if (updateError) return jsonError('Internal server error', 500)

    const posthog = getPostHogClient()
    posthog.capture({
      distinctId: userId,
      event: 'waiver_signed',
      properties: {
        waiver_id: waiver.id,
        waiver_title: waiver.title,
        waiver_source: 'coach',
        assignment_id: assignmentId,
      },
    })

    return NextResponse.json({ signature: signedAssignment })
  }

  // Verify the waiver exists and is active, and the user belongs to that org
  const { data: waiver } = await supabaseAdmin
    .from('org_waivers')
    .select('id, org_id, title, required_roles, is_active')
    .eq('id', waiverId)
    .eq('is_active', true)
    .maybeSingle()

  if (!waiver) return jsonError('Waiver not found or no longer active', 404)

  // Verify the user is a member of the waiver's org
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('org_id', waiver.org_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) return jsonError('You are not a member of this organization', 403)

  const { data: signature, error: insertError } = await supabaseAdmin
    .from('waiver_signatures')
    .insert({
      waiver_id: waiverId,
      user_id: userId,
      full_name: fullName,
      ip_address: ip,
    })
    .select('id, waiver_id, signed_at, full_name')
    .single()

  if (insertError) {
    // Unique constraint violation means already signed
    if (insertError.code === '23505') {
      return jsonError('You have already signed this waiver', 409)
    }
    return jsonError('Internal server error', 500)
  }

  const posthog = getPostHogClient()
  posthog.capture({
    distinctId: userId,
    event: 'waiver_signed',
    properties: {
      waiver_id: waiverId,
      waiver_title: waiver.title,
      org_id: waiver.org_id,
    },
  })

  return NextResponse.json({ signature })
}
