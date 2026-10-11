import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(request: Request) {
  const auth = await requireSuperadminApi(request)
  if (auth.error) return auth.error
  const [{ data: rules, error: rulesError }, { data: exceptions, error: exceptionsError }] = await Promise.all([
    supabaseAdmin.from('platform_fee_rules').select('*').order('active', { ascending: false }),
    supabaseAdmin.from('organization_fee_exceptions').select('*, organizations(name)').order('created_at', { ascending: false }),
  ])
  if (rulesError || exceptionsError) return fail(rulesError?.message || exceptionsError?.message || 'Unable to load fee rules', 500)
  return NextResponse.json({ rules: rules || [], exceptions: exceptions || [] })
}

export async function POST(request: Request) {
  const auth = await requireSuperadminApi(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const kind = String(body.kind || '')
  const reason = String(body.reason || '').trim()
  if (!reason) return fail('reason is required')
  if (kind === 'rule') {
    const percentage = Number(body.percentage)
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return fail('percentage must be between 0 and 100')
    const row = { tier: String(body.tier || '').trim(), category: String(body.category || '').trim(), percentage, active: body.active !== false }
    if (!row.tier || !row.category) return fail('tier and category are required')
    const query = body.id
      ? supabaseAdmin.from('platform_fee_rules').update(row).eq('id', body.id)
      : supabaseAdmin.from('platform_fee_rules').insert(row)
    const { error } = await query
    if (error) return fail(error.message, 500)
    await logAdminAction({ action: 'admin.fee_rule.save', actorId: auth.user.id, actorEmail: auth.user.email || null, targetType: 'fee_rule', targetId: String(body.id || `${row.tier}:${row.category}`), metadata: { reason, ...row } })
  } else if (kind === 'exception') {
    const percentage = Number(body.percentage)
    const orgId = String(body.org_id || '')
    if (!orgId || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return fail('org_id and a valid percentage are required')
    const endsAt = body.ends_at ? new Date(body.ends_at) : null
    if (endsAt && Number.isNaN(endsAt.getTime())) return fail('ends_at must be a valid date')
    const { error } = await supabaseAdmin.from('organization_fee_exceptions').insert({ org_id: orgId, fee_percent: percentage, reason, ends_at: endsAt?.toISOString() || null, created_by: auth.user.id })
    if (error) return fail(error.message, 500)
    await logAdminAction({ action: 'admin.organization_fee_exception.grant', actorId: auth.user.id, actorEmail: auth.user.email || null, targetType: 'organization', targetId: orgId, metadata: { reason, percentage, ends_at: endsAt?.toISOString() || null } })
  } else if (kind === 'deactivate_exception') {
    const id = String(body.id || '')
    if (!id) return fail('id is required')
    const { error } = await supabaseAdmin.from('organization_fee_exceptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return fail(error.message, 500)
    await logAdminAction({ action: 'admin.organization_fee_exception.revoke', actorId: auth.user.id, actorEmail: auth.user.email || null, targetType: 'fee_exception', targetId: id, metadata: { reason } })
  } else return fail('Unsupported fee action')
  return NextResponse.json({ ok: true })
}
