import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store, max-age=0' }
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers })

const resolveAccess = async (token: string) => {
  if (!token) return null
  const hash = createHash('sha256').update(token).digest('hex')
  const { data } = await supabaseAdmin.from('registration_access_tokens')
    .select('id,email,expires_at').eq('token_hash', hash).gt('expires_at', new Date().toISOString()).maybeSingle()
  return data
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || ''
  const access = await resolveAccess(token)
  if (!access) return fail('This secure registration link is invalid or expired.', 401)
  await supabaseAdmin.from('registration_access_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', access.id)

  const selection = 'id,form_id,org_id,athlete_name,status,payment_status,amount_due_cents,created_at,guardian_email,athlete_email,org_enrollment_forms(title,slug),organizations(name)'
  const [{ data: guardianSubmissions }, { data: athleteSubmissions }] = await Promise.all([
    supabaseAdmin.from('org_enrollment_submissions').select(selection).eq('guardian_email', access.email).order('created_at', { ascending: false }),
    supabaseAdmin.from('org_enrollment_submissions').select(selection).eq('athlete_email', access.email).order('created_at', { ascending: false }),
  ])
  const submissions = Array.from(new Map([...(guardianSubmissions || []), ...(athleteSubmissions || [])].map((item) => [item.id, item])).values())
  const ids = (submissions || []).map((item) => item.id)
  const { data: approvals } = ids.length
    ? await supabaseAdmin.from('guardian_registration_approvals').select('submission_id,status,decided_at').in('submission_id', ids)
    : { data: [] }
  const approvalBySubmission = new Map((approvals || []).map((item) => [item.submission_id, item]))
  return NextResponse.json({
    email: access.email,
    registrations: (submissions || []).map((item) => ({ ...item, guardian_approval: approvalBySubmission.get(item.id) || null })),
  }, { headers })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const token = String(body?.token || '')
  const submissionId = String(body?.submission_id || '')
  const decision = String(body?.decision || '')
  if (!submissionId || !['approved', 'denied'].includes(decision)) return fail('A registration and decision are required.')
  const access = await resolveAccess(token)
  if (!access) return fail('This secure registration link is invalid or expired.', 401)
  const { data: approval } = await supabaseAdmin.from('guardian_registration_approvals')
    .select('submission_id,guardian_email,status').eq('submission_id', submissionId).ilike('guardian_email', access.email).maybeSingle()
  if (!approval) return fail('Guardian approval is unavailable for this registration.', 404)
  if (approval.status !== 'pending') return fail('This guardian decision has already been recorded.', 409)

  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('guardian_registration_approvals')
    .update({ status: decision, decided_at: now }).eq('submission_id', submissionId).eq('status', 'pending')
  if (error) return fail('Unable to record the guardian decision.', 500)
  await supabaseAdmin.from('org_enrollment_submissions')
    .update({ status: decision === 'approved' ? 'pending' : 'declined' }).eq('id', submissionId)
  return NextResponse.json({ ok: true, status: decision }, { headers })
}
