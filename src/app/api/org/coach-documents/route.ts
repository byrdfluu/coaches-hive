import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveOrganizationForUser } from '@/lib/activeOrganization'

export const dynamic = 'force-dynamic'
const roles = ['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'team_manager', 'admin']
const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET() {
  const { session, supabase, error } = await getSessionRole(roles)
  if (error || !session) return error
  const context = await resolveActiveOrganizationForUser(session.user.id)
  if (!context) return jsonError('Select an organization workspace.', 409)

  const [{ data: requests, error: requestError }, { data: members }] = await Promise.all([
    supabase.from('coach_document_requests')
      .select('id,org_id,coach_id,title,description,document_type,due_at,expires_at,status,review_note,created_at')
      .eq('org_id', context.organizationId).order('created_at', { ascending: false }),
    supabase.from('organization_memberships').select('user_id,role')
      .eq('org_id', context.organizationId).eq('status', 'active').in('role', ['coach', 'assistant_coach']),
  ])
  if (requestError) return jsonError('Unable to load coach document requests.', 500)
  const coachIds = Array.from(new Set([...(members || []).map((member) => member.user_id), ...(requests || []).map((request) => request.coach_id)]))
  const [{ data: profiles }, { data: submissions }] = await Promise.all([
    coachIds.length ? supabase.from('profiles').select('id,full_name,email').in('id', coachIds) : Promise.resolve({ data: [] }),
    (requests || []).length ? supabase.from('coach_document_submissions')
      .select('id,request_id,storage_path,filename,content_type,note,created_at')
      .in('request_id', (requests || []).map((request) => request.id)).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ])
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile.full_name || profile.email || 'Coach']))
  const submissionMap = new Map<string, Record<string, unknown>>()
  for (const submission of submissions || []) if (!submissionMap.has(submission.request_id)) submissionMap.set(submission.request_id, submission)
  const rows = await Promise.all((requests || []).map(async (request) => {
    const submission = submissionMap.get(request.id) || null
    let downloadUrl: string | null = null
    if (submission?.storage_path) {
      const { data } = await supabase.storage.from('org-documents').createSignedUrl(String(submission.storage_path), 15 * 60)
      downloadUrl = data?.signedUrl || null
    }
    return { ...request, coach_name: profileMap.get(request.coach_id) || 'Coach', submission: submission ? { ...submission, download_url: downloadUrl } : null }
  }))
  return NextResponse.json({ requests: rows, coaches: (members || []).map((member) => ({ id: member.user_id, name: profileMap.get(member.user_id) || 'Coach' })) }, { headers: privateHeaders })
}

export async function POST(request: Request) {
  const { session, supabase, error } = await getSessionRole(roles)
  if (error || !session) return error
  const context = await resolveActiveOrganizationForUser(session.user.id)
  if (!context) return jsonError('Select an organization workspace.', 409)
  const body = await request.json().catch(() => ({}))
  const coachId = String(body.coach_id || '').trim()
  const title = String(body.title || '').trim()
  const documentType = String(body.document_type || 'document').trim()
  if (!coachId || !title) return jsonError('Coach and document title are required.')
  if (title.length > 160) return jsonError('Document title must be 160 characters or fewer.')
  const { data: member } = await supabase.from('organization_memberships').select('user_id')
    .eq('org_id', context.organizationId).eq('user_id', coachId).eq('status', 'active')
    .in('role', ['coach', 'assistant_coach']).maybeSingle()
  if (!member) return jsonError('Coach is not active in the selected organization.', 404)
  const { data, error: insertError } = await supabase.from('coach_document_requests').insert({
    org_id: context.organizationId,
    coach_id: coachId,
    requested_by: session.user.id,
    title,
    description: String(body.description || '').trim().slice(0, 4000) || null,
    document_type: documentType.slice(0, 80),
    due_at: body.due_at || null,
  }).select('id,status').single()
  if (insertError || !data) return jsonError('Unable to create the document request.', 500)
  return NextResponse.json({ request: data }, { status: 201, headers: privateHeaders })
}

export async function PATCH(request: Request) {
  const { session, supabase, error } = await getSessionRole(roles)
  if (error || !session) return error
  const context = await resolveActiveOrganizationForUser(session.user.id)
  if (!context) return jsonError('Select an organization workspace.', 409)
  const body = await request.json().catch(() => ({}))
  const requestId = String(body.request_id || '').trim()
  const decision = String(body.decision || '').trim()
  if (!requestId || !['approved', 'rejected'].includes(decision)) return jsonError('Request and a valid decision are required.')
  const { data: record } = await supabase.from('coach_document_requests').select('id').eq('id', requestId).eq('org_id', context.organizationId).maybeSingle()
  if (!record) return jsonError('Document request not found.', 404)
  const { error: reviewError } = await supabase.rpc('review_coach_document_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_note: String(body.note || '').trim().slice(0, 2000) || null,
  })
  if (reviewError) return jsonError('Unable to review this document.', 409)
  return NextResponse.json({ ok: true }, { headers: privateHeaders })
}
