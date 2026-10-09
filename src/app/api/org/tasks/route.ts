import { NextRequest, NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveOrganizationForUser } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const MANAGER_ROLES = new Set(['owner', 'org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director'])
const CATEGORIES = new Set(['general', 'roster', 'schedule', 'payments', 'documents', 'compliance', 'operations'])
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent'])

async function context(userId: string) {
  return resolveActiveOrganizationForUser(userId)
}

export async function GET() {
  const { session, error } = await getSessionRole()
  if (error || !session) return error || jsonError('Unauthorized', 401)
  const org = await context(session.user.id)
  if (!org) return jsonError('Organization workspace required', 403)
  const manager = MANAGER_ROLES.has(org.role)
  let query = supabaseAdmin.from('org_tasks')
    .select('id,org_id,title,details,category,priority,status,due_at,assigned_to,created_by,completed_at,created_at,updated_at')
    .eq('org_id', org.organizationId).order('created_at', { ascending: false })
  if (!manager) query = query.eq('assigned_to', session.user.id)
  const [{ data: tasks, error: taskError }, { data: memberships, error: memberError }] = await Promise.all([
    query,
    manager
      ? supabaseAdmin.from('organization_memberships').select('user_id').eq('org_id', org.organizationId).eq('status', 'active')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (taskError || memberError) return jsonError('Unable to load organization tasks', 500)
  const ids = Array.from(new Set((memberships || []).map(row => row.user_id).filter(Boolean)))
  const { data: profiles } = ids.length
    ? await supabaseAdmin.from('profiles').select('id,full_name,email').in('id', ids)
    : { data: [] }
  return NextResponse.json({ tasks: tasks || [], assignees: profiles || [], can_manage: manager })
}

export async function POST(request: NextRequest) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error || jsonError('Unauthorized', 401)
  const org = await context(session.user.id)
  if (!org || !MANAGER_ROLES.has(org.role)) return jsonError('Task creation denied', 403)
  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  const category = String(body.category || 'general')
  const priority = String(body.priority || 'normal')
  if (!title || title.length > 160) return jsonError('Enter a task title of 160 characters or fewer')
  if (!CATEGORIES.has(category) || !PRIORITIES.has(priority)) return jsonError('Invalid task category or priority')
  if (body.assigned_to) {
    const { data: member } = await supabaseAdmin.from('organization_memberships').select('user_id')
      .eq('org_id', org.organizationId).eq('user_id', body.assigned_to).eq('status', 'active').maybeSingle()
    if (!member) return jsonError('Assignee must be an active organization member')
  }
  const { data, error: insertError } = await supabaseAdmin.from('org_tasks').insert({
    org_id: org.organizationId, title, details: String(body.details || '').trim() || null,
    category, priority, due_at: body.due_at || null, assigned_to: body.assigned_to || null,
    created_by: session.user.id,
  }).select('*').single()
  if (insertError) return jsonError('Unable to create task', 500)
  return NextResponse.json({ task: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error || jsonError('Unauthorized', 401)
  const org = await context(session.user.id)
  if (!org) return jsonError('Organization workspace required', 403)
  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  const completed = body.completed
  if (!id || typeof completed !== 'boolean') return jsonError('Task id and completion state are required')
  const { data: task } = await supabaseAdmin.from('org_tasks').select('id,assigned_to').eq('id', id).eq('org_id', org.organizationId).maybeSingle()
  if (!task) return jsonError('Task not found', 404)
  if (!MANAGER_ROLES.has(org.role) && task.assigned_to !== session.user.id) return jsonError('Task update denied', 403)
  const { data, error: updateError } = await supabaseAdmin.from('org_tasks').update({
    status: completed ? 'completed' : 'open', completed_at: completed ? new Date().toISOString() : null,
  }).eq('id', id).eq('org_id', org.organizationId).select('*').single()
  if (updateError) return jsonError('Unable to update task', 500)
  return NextResponse.json({ task: data })
}

export async function DELETE(request: NextRequest) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error || jsonError('Unauthorized', 401)
  const org = await context(session.user.id)
  if (!org || !MANAGER_ROLES.has(org.role)) return jsonError('Task deletion denied', 403)
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return jsonError('Task id is required')
  const { error: deleteError } = await supabaseAdmin.from('org_tasks').delete().eq('id', id).eq('org_id', org.organizationId)
  if (deleteError) return jsonError('Unable to delete task', 500)
  return NextResponse.json({ success: true })
}
