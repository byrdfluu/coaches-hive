import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveOrganizationId } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ROLES = ['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'team_manager', 'admin']

async function context() {
  const { session, error } = await getSessionRole(ROLES)
  if (error || !session) return { response: error }
  const orgId = await resolveActiveOrganizationId(session.user.id)
  if (!orgId) return { response: jsonError('Organization not found', 404) }
  return { orgId }
}

export async function GET() {
  const auth = await context()
  if ('response' in auth) return auth.response
  const { data, error } = await supabaseAdmin.from('org_compliance_uploads')
    .select('id,file_name,file_path,file_type,file_size,created_at,uploaded_by')
    .eq('org_id', auth.orgId).order('created_at', { ascending: false })
  if (error) return jsonError('Unable to load compliance uploads', 500)
  const rows = data || []
  const { data: signed } = rows.length
    ? await supabaseAdmin.storage.from('attachments').createSignedUrls(rows.map((row) => row.file_path), 15 * 60)
    : { data: [] }
  return NextResponse.json({ uploads: rows.map((row, index) => ({
    id: row.id,
    name: row.file_name || 'Document',
    mime_type: row.file_type,
    size_bytes: row.file_size,
    created_at: row.created_at,
    download_url: signed?.[index]?.signedUrl || null,
  })) })
}

export async function DELETE(request: Request) {
  const auth = await context()
  if ('response' in auth) return auth.response
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return jsonError('Upload id is required')
  const { data: upload } = await supabaseAdmin.from('org_compliance_uploads').select('id,file_path')
    .eq('id', id).eq('org_id', auth.orgId).maybeSingle()
  if (!upload) return jsonError('Compliance upload not found', 404)
  const { error: deleteError } = await supabaseAdmin.from('org_compliance_uploads').delete()
    .eq('id', upload.id).eq('org_id', auth.orgId)
  if (deleteError) return jsonError('Unable to delete compliance upload', 500)
  const { error: storageError } = await supabaseAdmin.storage.from('attachments').remove([upload.file_path])
  if (storageError) return jsonError('Upload record was deleted, but file cleanup must be retried', 500)
  return NextResponse.json({ deleted: true })
}
