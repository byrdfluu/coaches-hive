import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveOrganizationId } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ROLES = ['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'team_manager', 'admin']
const STATUSES = new Set(['pending', 'complete', 'overdue', 'waived'])

async function context() {
  const { session, error } = await getSessionRole(ROLES)
  if (error || !session) return { response: error }
  const orgId = await resolveActiveOrganizationId(session.user.id)
  if (!orgId) return { response: jsonError('Organization not found', 404) }
  return { session, orgId }
}

async function validateAssignee(orgId: string, assignedTo: unknown) {
  if (assignedTo === null || assignedTo === undefined || assignedTo === '') return null
  if (typeof assignedTo !== 'string') return false
  const { data } = await supabaseAdmin.from('organization_memberships').select('user_id')
    .eq('org_id', orgId).eq('user_id', assignedTo).eq('status', 'active').maybeSingle()
  return data ? assignedTo : false
}

export async function GET() {
  const request = await context()
  if ('response' in request) return request.response
  const [{ data: items, error }, { data: memberships }] = await Promise.all([
    supabaseAdmin.from('org_compliance_items').select('*').eq('org_id', request.orgId).order('due_date'),
    supabaseAdmin.from('organization_memberships').select('user_id').eq('org_id', request.orgId).eq('status', 'active'),
  ])
  if (error) return jsonError('Unable to load compliance items', 500)
  const memberIds = Array.from(new Set((memberships || []).map((member) => member.user_id).filter(Boolean)))
  const { data: profiles } = memberIds.length
    ? await supabaseAdmin.from('profiles').select('id,full_name,email').in('id', memberIds)
    : { data: [] }
  return NextResponse.json({ items: items || [], assignees: profiles || [] })
}

export async function POST(request: Request) {
  const auth = await context()
  if ('response' in auth) return auth.response
  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  if (!title || title.length > 160) return jsonError('Enter a title of 160 characters or fewer')
  const assignedTo = await validateAssignee(auth.orgId, body.assigned_to)
  if (assignedTo === false) return jsonError('Assignee must be an active organization member')
  const { data, error } = await supabaseAdmin.from('org_compliance_items').insert({
    org_id: auth.orgId,
    title,
    description: String(body.description || '').trim() || null,
    due_date: body.due_date || null,
    assigned_to: assignedTo,
  }).select('*').single()
  if (error) return jsonError('Unable to create compliance item', 500)
  return NextResponse.json({ item: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const auth = await context()
  if ('response' in auth) return auth.response
  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return jsonError('Compliance item id is required')
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) {
    if (!STATUSES.has(String(body.status))) return jsonError('Choose a valid status')
    update.status = body.status
  }
  if (body.title !== undefined) {
    const title = String(body.title || '').trim()
    if (!title || title.length > 160) return jsonError('Enter a title of 160 characters or fewer')
    update.title = title
  }
  if (body.description !== undefined) update.description = String(body.description || '').trim() || null
  if (body.due_date !== undefined) update.due_date = body.due_date || null
  if (body.assigned_to !== undefined) {
    const assignedTo = await validateAssignee(auth.orgId, body.assigned_to)
    if (assignedTo === false) return jsonError('Assignee must be an active organization member')
    update.assigned_to = assignedTo
  }
  const { data, error } = await supabaseAdmin.from('org_compliance_items').update(update)
    .eq('id', id).eq('org_id', auth.orgId).select('*').maybeSingle()
  if (error) return jsonError('Unable to update compliance item', 500)
  if (!data) return jsonError('Compliance item not found', 404)
  return NextResponse.json({ item: data })
}

export async function DELETE(request: Request) {
  const auth = await context()
  if ('response' in auth) return auth.response
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return jsonError('Compliance item id is required')
  const { data, error } = await supabaseAdmin.from('org_compliance_items').delete()
    .eq('id', id).eq('org_id', auth.orgId).select('id').maybeSingle()
  if (error) return jsonError('Unable to delete compliance item', 500)
  if (!data) return jsonError('Compliance item not found', 404)
  return NextResponse.json({ ok: true })
}
