import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { checkYouthRegistration } from '@/lib/youthPrivacy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const allowedTypes = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const body = await request.formData().catch(() => null)
  const file = body?.get('file')
  const requirementId = String(body?.get('requirement_id') || '').trim()
  if (!(file instanceof File) || !requirementId) return error('A document and requirement are required.')
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) return error('Choose a document smaller than 10 MB.')
  if (!allowedTypes.has(file.type)) return error('Upload a PDF, JPG, PNG, DOC, or DOCX file.')

  const { data: form } = await supabaseAdmin.from('org_enrollment_forms')
    .select('id,org_id,is_active,required_documents').eq('slug', slug).maybeSingle()
  if (!form || !form.is_active) return error('This registration form is unavailable.', 404)
  const youth = checkYouthRegistration(body?.get('date_of_birth'))
  if (youth.error || !youth.birthDate) return error(youth.error || 'Enter a valid date of birth before uploading documents.', 422)
  if (youth.isUnder13 && (body?.get('guardian_identity_confirmed') !== 'true' || body?.get('coppa_consent_given') !== 'true')) return error('Parent or guardian consent is required before uploading a child’s documents.', 422)
  const requirements = Array.isArray(form.required_documents) ? form.required_documents as Array<Record<string, unknown>> : []
  if (!requirements.some((item) => String(item.id) === requirementId)) return error('This document was not requested.', 403)

  const token = randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'document'
  const path = `${form.org_id}/${form.id}/${randomUUID()}-${safeName}`.toLowerCase()
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabaseAdmin.storage.from('registration-documents').upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) return error('Unable to upload the document. Please try again.', 500)

  const { data: row, error: insertError } = await supabaseAdmin.from('org_enrollment_document_uploads').insert({
    form_id: form.id,
    requirement_id: requirementId,
    storage_path: path,
    filename: file.name.slice(0, 255),
    content_type: file.type,
    size_bytes: file.size,
    upload_token_hash: createHash('sha256').update(token).digest('hex'),
  }).select('id,requirement_id,filename').single()
  if (insertError || !row) {
    await supabaseAdmin.storage.from('registration-documents').remove([path])
    return error('Unable to save the document. Please try again.', 500)
  }
  return NextResponse.json({ upload: { ...row, token } }, { status: 201 })
}
