import { NextResponse } from 'next/server'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }

async function requireModerator(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return { error: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }) }
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const access = resolveAdminAccess({ ...(user.user_metadata || {}), role: profile?.role || user.user_metadata?.role })
  if (!['superadmin', 'ops', 'support'].includes(String(access.teamRole || ''))) {
    return { error: NextResponse.json({ error: 'You do not have moderation access.' }, { status: 403 }) }
  }
  return { user, error: null }
}

export async function GET(request: Request) {
  const auth = await requireModerator(request)
  if (auth.error) return auth.error
  const url = new URL(request.url)
  const status = String(url.searchParams.get('status') || 'open')
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const pageSize = 25
  let query = supabaseAdmin.from('content_reports').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('status', status)
  const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) return NextResponse.json({ error: 'Unable to load content reports.' }, { status: 500 })
  const ids = Array.from(new Set((data || []).flatMap((row: any) => [row.reporter_id, row.reported_user_id]).filter(Boolean)))
  const { data: profiles } = ids.length ? await supabaseAdmin.from('profiles').select('id,full_name,email').in('id', ids) : { data: [] }
  const names = new Map((profiles || []).map((profile: any) => [profile.id, profile.full_name || profile.email || 'User']))
  return NextResponse.json({
    reports: (data || []).map((row: any) => ({ ...row, reporter_name: names.get(row.reporter_id) || 'User', reported_user_name: row.reported_user_id ? names.get(row.reported_user_id) || 'User' : null })),
    page, page_size: pageSize, total: count || 0, total_pages: Math.max(1, Math.ceil((count || 0) / pageSize)),
  }, { headers: noStore })
}

export async function PATCH(request: Request) {
  const auth = await requireModerator(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => null)
  const id = String(body?.id || '')
  const status = String(body?.status || '')
  const notes = String(body?.admin_notes || '').trim()
  if (!id || !['open', 'in_review', 'resolved', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'A report and valid status are required.' }, { status: 400 })
  }
  if (notes.length > 10000) return NextResponse.json({ error: 'Notes must be 10,000 characters or fewer.' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('content_reports').update({ status, admin_notes: notes, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: 'Unable to update this report.' }, { status: 500 })
  await supabaseAdmin.from('admin_audit_log').insert({ actor_id: auth.user!.id, target_type: 'content_reports', target_id: id, action: 'content_report_resolved', metadata: { new_status: status, content_type: data.content_type } })
  return NextResponse.json({ report: data }, { headers: noStore })
}
