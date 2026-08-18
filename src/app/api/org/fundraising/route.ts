import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { randomBytes } from 'node:crypto'

const ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','admin']
async function orgFor(id: string) { const { data } = await supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', id).maybeSingle(); return data?.org_id || null }
export async function GET() {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const orgId = await orgFor(session.user.id); if (!orgId) return jsonError('Organization not found', 404)
  const { data: campaigns, error: dbError } = await supabaseAdmin.from('fundraising_campaigns').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  if (dbError) return jsonError(dbError.message, 500)
  const ids = (campaigns || []).map((row) => row.id); const { data: contributions } = ids.length ? await supabaseAdmin.from('fundraising_contributions').select('*').in('campaign_id', ids) : { data: [] }
  return NextResponse.json({ campaigns: (campaigns || []).map((campaign) => ({ ...campaign, raised_amount_cents: (contributions || []).filter((row) => row.campaign_id === campaign.id).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0) })), contributions: contributions || [] })
}
export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const orgId = await orgFor(session.user.id); if (!orgId) return jsonError('Organization not found', 404)
  const body = await request.json().catch(() => ({})); const goal = Math.round(Number(body.goal_amount_cents || 0))
  if (!String(body.name || '').trim() || goal <= 0) return jsonError('name and positive goal_amount_cents are required')
  const suggested = Array.isArray(body.suggested_amounts_cents) ? body.suggested_amounts_cents.map(Number).map(Math.round).filter((n: number) => n > 0) : []
  const { data, error: dbError } = await supabaseAdmin.from('fundraising_campaigns').insert({
    org_id: orgId, team_id: body.team_id || null, name: String(body.name).trim(), description: body.description || null,
    goal_amount_cents: goal, deadline: body.deadline || null, suggested_amounts_cents: suggested,
    is_tax_deductible: Boolean(body.is_tax_deductible), active: true,
    slug: `${String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,50)}-${randomBytes(4).toString('hex')}`,
    created_by: session.user.id,
  }).select('*').single()
  if (dbError) return jsonError(dbError.message, 500); return NextResponse.json({ campaign: data }, { status: 201 })
}
