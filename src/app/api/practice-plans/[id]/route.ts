import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = [
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager',
]

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, role, error } = await getSessionRole()
  if (error || !session) return error

  const { id: planId } = await params
  if (!planId) return jsonError('plan id is required')

  const { data: plan, error: planError } = await supabaseAdmin
    .from('practice_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle()

  if (planError) return jsonError('Internal server error', 500)
  if (!plan) return jsonError('Plan not found', 404)

  // Verify the requesting user has access to this plan
  const userId = session.user.id
  let hasAccess = false

  if (role === 'coach') {
    hasAccess = plan.coach_id === userId
  } else if (role === 'athlete') {
    if (plan.athlete_id === userId) {
      hasAccess = true
    } else if (plan.team_id) {
      const { count } = await supabaseAdmin
        .from('org_team_members')
        .select('team_id', { count: 'exact', head: true })
        .eq('team_id', plan.team_id)
        .eq('athlete_id', userId)
      hasAccess = (count ?? 0) > 0
    }
  } else if (role === 'admin' || ORG_ADMIN_ROLES.includes(role ?? '')) {
    if (plan.org_id) {
      const { count } = await supabaseAdmin
        .from('organization_memberships')
        .select('org_id', { count: 'exact', head: true })
        .eq('org_id', plan.org_id)
        .eq('user_id', userId)
      hasAccess = (count ?? 0) > 0
    } else if (role === 'admin') {
      hasAccess = true
    }
  }

  if (!hasAccess) return jsonError('Not found', 404)

  const { data: attachments } = await supabaseAdmin
    .from('practice_plan_attachments')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true })

  const attachmentRows = attachments || []
  const durablePaths = attachmentRows.map((attachment) => attachment.file_path).filter(Boolean)
  const { data: signedRows } = durablePaths.length
    ? await supabaseAdmin.storage.from('attachments').createSignedUrls(durablePaths, 5 * 60)
    : { data: [] }
  const signedByPath = new Map(durablePaths.map((path, index) => [path, signedRows?.[index]?.signedUrl || null]))

  return NextResponse.json({
    plan,
    attachments: attachmentRows.map((attachment) => ({
      ...attachment,
      file_url: attachment.file_path
        ? signedByPath.get(attachment.file_path) || ''
        : attachment.file_url || '',
    })),
  })
}
