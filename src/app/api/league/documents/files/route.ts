import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { leagueCan, requireLeagueMembership } from '@/lib/leagueAuthority'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const bucket = 'league-documents'
const maximumBytes = 20 * 1024 * 1024
const allowedTypes = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif',
  'text/plain', 'application/rtf', 'application/octet-stream',
])
const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-180) || 'document'

const authenticate = async (request: Request) => {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { response: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }) }
  const authority = await requireLeagueMembership(session.user.id, request.headers.get('x-workspace-id'))
  if (!authority) return { response: NextResponse.json({ error: 'Your league access is no longer active.' }, { status: 403 }) }
  if (!leagueCan(authority, 'manage_documents')) return { response: NextResponse.json({ error: 'You do not have permission to manage league documents.' }, { status: 403 }) }
  return { session, authority }
}

const removeObject = async (path: string | null | undefined) => {
  if (path) await supabaseAdmin.storage.from(bucket).remove([path])
}

export async function POST(request: Request) {
  const auth = await authenticate(request)
  if ('response' in auth) return auth.response
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const action = String(form?.get('action') || '')
  const documentId = String(form?.get('document_id') || '')
  if (!(file instanceof File) || !documentId || !['replace_document_file', 'create_submission'].includes(action)) {
    return NextResponse.json({ error: 'A document file and supported action are required.' }, { status: 400 })
  }
  if (!file.size || file.size > maximumBytes || !allowedTypes.has(file.type || 'application/octet-stream')) {
    return NextResponse.json({ error: 'Use an allowed PDF, image, text, or RTF file up to 20 MB.' }, { status: 400 })
  }
  const { data: document } = await supabaseAdmin.from('league_documents').select('id,league_id,storage_path').eq('id', documentId).eq('league_id', auth.authority.league_id).maybeSingle()
  if (!document) return NextResponse.json({ error: 'League document not found.' }, { status: 404 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const filename = safeName(file.name)
  const mimeType = file.type || 'application/octet-stream'
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const objectId = action === 'replace_document_file' ? document.id : randomUUID()
  const storagePath = `${auth.authority.league_id}/${objectId}/${randomUUID()}-${filename}`
  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(storagePath, bytes, { contentType: mimeType, upsert: false })
  if (uploadError) {
    console.error('[league/documents/files] upload failed', uploadError)
    return NextResponse.json({ error: 'The document could not be uploaded.' }, { status: 500 })
  }

  const metadata = { storage_path: storagePath, storage_filename: file.name, storage_mime_type: mimeType, storage_size_bytes: file.size, storage_sha256: sha256 }
  if (action === 'replace_document_file') {
    const { data: updated, error } = await supabaseAdmin.from('league_documents').update(metadata).eq('id', document.id).eq('league_id', auth.authority.league_id).select('id').maybeSingle()
    if (error || !updated) {
      await removeObject(storagePath)
      console.error('[league/documents/files] document metadata update failed', error)
      return NextResponse.json({ error: 'The uploaded file could not be attached to the document.' }, { status: 500 })
    }
    if (document.storage_path && document.storage_path !== storagePath) await removeObject(document.storage_path)
    return NextResponse.json({ document_id: updated.id, storage_path: storagePath })
  }

  const organizationId = String(form?.get('org_id') || '')
  const teamId = String(form?.get('team_id') || '')
  if (!organizationId && !teamId) {
    await removeObject(storagePath)
    return NextResponse.json({ error: 'Choose an organization or team for this submission.' }, { status: 400 })
  }
  if (organizationId) {
    const { data } = await supabaseAdmin.from('league_organizations').select('id').eq('league_id', auth.authority.league_id).eq('org_id', organizationId).eq('status', 'active').maybeSingle()
    if (!data) { await removeObject(storagePath); return NextResponse.json({ error: 'The selected organization is outside this league.' }, { status: 403 }) }
  }
  if (teamId) {
    const { data } = await supabaseAdmin.from('league_team_assignments').select('id').eq('league_id', auth.authority.league_id).eq('team_id', teamId).eq('status', 'active').maybeSingle()
    if (!data) { await removeObject(storagePath); return NextResponse.json({ error: 'The selected team is outside this league.' }, { status: 403 }) }
  }
  const { data: submission, error } = await supabaseAdmin.from('league_document_submissions').insert({
    league_id: auth.authority.league_id, document_id: document.id,
    org_id: organizationId || null, team_id: teamId || null,
    submitted_by: auth.session.user.id, status: 'submitted', ...metadata,
  }).select('id').single()
  if (error) {
    await removeObject(storagePath)
    console.error('[league/documents/files] submission metadata insert failed', error)
    return NextResponse.json({ error: 'The uploaded submission could not be saved.' }, { status: 500 })
  }
  return NextResponse.json({ submission_id: submission.id, storage_path: storagePath }, { status: 201 })
}
