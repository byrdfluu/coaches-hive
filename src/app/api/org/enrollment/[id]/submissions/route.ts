import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = [
  'org_admin','club_admin','travel_admin','school_admin',
  'athletic_director','program_director','team_manager',
]

async function getOrgId(userId: string) {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { org_id?: string } | null)?.org_id ?? null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)
  const { id } = await params

  // Verify form belongs to this org
  const { data: form } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!form) return jsonError('Form not found', 404)

  const { data, error: dbError } = await supabaseAdmin
    .from('org_enrollment_submissions')
    .select('*')
    .eq('form_id', id)
    .order('created_at', { ascending: false })

  if (dbError) return jsonError('Failed to fetch submissions', 500)
  return NextResponse.json({ submissions: data ?? [] })
}
