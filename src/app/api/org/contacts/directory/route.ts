import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','admin']
async function orgFor(userId: string) { const { data } = await supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', userId).maybeSingle(); return data?.org_id || null }

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const orgId = await orgFor(session.user.id); if (!orgId) return jsonError('Organization not found', 404)
  const body = await request.json().catch(() => ({})); const name = String(body.name || '').trim()
  if (!name) return jsonError('name is required')
  const { data, error: insertError } = await supabaseAdmin.from('org_contacts').insert({ org_id: orgId, name, role: body.role || null, email: body.email || null, phone: body.phone || null, notes: body.notes || null }).select('*').single()
  if (insertError) return jsonError(insertError.message, 500)
  return NextResponse.json({ contact: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const orgId = await orgFor(session.user.id); if (!orgId) return jsonError('Organization not found', 404)
  const id = new URL(request.url).searchParams.get('id'); if (!id) return jsonError('id is required')
  const { error: deleteError } = await supabaseAdmin.from('org_contacts').delete().eq('id', id).eq('org_id', orgId)
  if (deleteError) return jsonError(deleteError.message, 500)
  return NextResponse.json({ ok: true })
}
