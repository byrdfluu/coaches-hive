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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)
  const { id } = await params

  // Verify form belongs to this org
  const { data: form } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!form) return jsonError('Form not found', 404)

  const { data, error: dbError } = await supabaseAdmin
    .from('org_enrollment_submissions')
    .select('*')
    .eq('form_id', id)
    .order('created_at', { ascending: false })

  if (dbError) return jsonError('Failed to fetch submissions', 500)
  const submissionIds = (data || []).map((submission) => submission.id)
  const { data: documentRows } = submissionIds.length
    ? await supabaseAdmin.from('org_enrollment_document_uploads')
        .select('id,submission_id,requirement_id,storage_path,filename,content_type,size_bytes,created_at')
        .in('submission_id', submissionIds)
    : { data: [] }
  const documentsBySubmission = new Map<string, Array<Record<string, unknown>>>()
  for (const document of documentRows || []) {
    const { data: signed } = await supabaseAdmin.storage.from('registration-documents').createSignedUrl(document.storage_path, 15 * 60)
    const list = documentsBySubmission.get(document.submission_id) || []
    list.push({ ...document, download_url: signed?.signedUrl || null, storage_path: undefined })
    documentsBySubmission.set(document.submission_id, list)
  }
  return NextResponse.json({
    submissions: (data || []).map((submission) => ({ ...submission, documents: documentsBySubmission.get(submission.id) || [] })),
  })
}
