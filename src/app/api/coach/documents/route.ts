import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/rtf'])

export async function GET() {
  const { session, supabase, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const context = await resolveActiveCoachContext(session.user.id)
  if (!context.organizationId) return NextResponse.json({ requests: [], organization_id: null }, { headers: privateHeaders })

  const { data: requests, error: requestError } = await supabase
    .from('coach_document_requests')
    .select('id,org_id,coach_id,title,description,document_type,due_at,expires_at,status,review_note,created_at')
    .eq('org_id', context.organizationId)
    .eq('coach_id', session.user.id)
    .order('created_at', { ascending: false })
  if (requestError) return jsonError('Unable to load organization document requests.', 500)

  const requestIds = (requests || []).map((request) => request.id)
  const { data: submissions } = requestIds.length
    ? await supabase.from('coach_document_submissions')
        .select('id,request_id,storage_path,filename,content_type,file_sha256,note,created_at')
        .in('request_id', requestIds).order('created_at', { ascending: false })
    : { data: [] }
  const latestSubmission = new Map<string, Record<string, unknown>>()
  for (const submission of submissions || []) {
    if (!latestSubmission.has(submission.request_id)) latestSubmission.set(submission.request_id, submission)
  }
  const rows = await Promise.all((requests || []).map(async (request) => {
    const submission = latestSubmission.get(request.id) || null
    let downloadUrl: string | null = null
    if (submission?.storage_path) {
      const { data } = await supabase.storage.from('org-documents').createSignedUrl(String(submission.storage_path), 15 * 60)
      downloadUrl = data?.signedUrl || null
    }
    return { ...request, submission: submission ? { ...submission, download_url: downloadUrl } : null }
  }))
  return NextResponse.json({ requests: rows, organization_id: context.organizationId }, { headers: privateHeaders })
}

export async function POST(request: Request) {
  const { session, supabase, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const context = await resolveActiveCoachContext(session.user.id)
  if (!context.organizationId) return jsonError('Select an organization workspace before submitting a document.', 409)

  const form = await request.formData().catch(() => null)
  const requestId = String(form?.get('request_id') || '').trim()
  const note = String(form?.get('note') || '').trim()
  const file = form?.get('file')
  if (!requestId || !(file instanceof File)) return jsonError('A document request and file are required.')
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) return jsonError('Choose a file smaller than 10 MB.')
  if (!allowedTypes.has(file.type)) return jsonError('Upload a PDF, JPG, PNG, text, or RTF document.')

  const { data: documentRequest } = await supabase.from('coach_document_requests')
    .select('id,org_id,coach_id,status').eq('id', requestId)
    .eq('org_id', context.organizationId).eq('coach_id', session.user.id).maybeSingle()
  if (!documentRequest || !['requested', 'rejected'].includes(String(documentRequest.status))) {
    return jsonError('This document request is not available for submission.', 409)
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'document'
  const storagePath = `${context.organizationId}/${requestId}/${randomUUID()}-${safeName}`.toLowerCase()
  const { error: uploadError } = await supabase.storage.from('org-documents').upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) return jsonError('Unable to upload the document. Please try again.', 500)

  const { data: submission, error: insertError } = await supabase.from('coach_document_submissions').insert({
    request_id: requestId,
    submitted_by: session.user.id,
    storage_path: storagePath,
    filename: file.name.slice(0, 255),
    content_type: file.type,
    file_sha256: createHash('sha256').update(bytes).digest('hex'),
    note: note.slice(0, 2000) || null,
  }).select('id,request_id,filename,content_type,note,created_at').single()
  if (insertError || !submission) {
    await supabase.storage.from('org-documents').remove([storagePath])
    return jsonError('Unable to submit the document. Please try again.', 500)
  }
  return NextResponse.json({ submission }, { status: 201, headers: privateHeaders })
}
