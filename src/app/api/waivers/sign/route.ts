import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

// POST /api/waivers/sign — athlete signs a waiver
export async function POST(request: Request) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const waiverId = String(body?.waiver_id || '').trim()
  const fullName = String(body?.full_name || '').trim()

  if (!waiverId) return jsonError('waiver_id is required')
  if (!fullName) return jsonError('full_name is required')

  const userId = session.user.id

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

  // Get client IP for the audit record
  const headersList = headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    null

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
    return jsonError(insertError.message, 500)
  }

  return NextResponse.json({ signature })
}
