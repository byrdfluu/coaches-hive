import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveOrganizationId } from '@/lib/activeOrganization'

export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = [
  'org_admin','club_admin','travel_admin','school_admin',
  'athletic_director','program_director','team_manager',
]

const getOrgId = resolveActiveOrganizationId

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const allowed = ['title','description','sport','age_group','team_id','season_id','is_active']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] === '' ? null : body[key]
  }
  if (Array.isArray(body?.required_documents)) {
    updates.required_documents = body.required_documents.slice(0, 12).map((item: any) => ({
      id: String(item?.id || '').trim().slice(0, 80),
      label: String(item?.label || '').trim().slice(0, 120),
      instructions: String(item?.instructions || '').trim().slice(0, 500),
      required: item?.required !== false,
    })).filter((item: { id: string; label: string }) => item.id && item.label)
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('org_enrollment_forms')
    .update(updates)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (dbError) return jsonError('Failed to update enrollment form', 500)
  return NextResponse.json({ form: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)
  const { id } = await params

  const { error: dbError } = await supabaseAdmin
    .from('org_enrollment_forms')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (dbError) return jsonError('Failed to delete enrollment form', 500)
  return NextResponse.json({ ok: true })
}
