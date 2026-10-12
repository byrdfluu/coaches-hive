import { NextResponse } from 'next/server'
import { getSessionRole, jsonError, commonRoles } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveOrganizationId } from '@/lib/activeOrganization'
export const dynamic = 'force-dynamic'


const ensureBucket = async (bucketName: string) => {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets()
  if (error) throw new Error(error.message)
  const exists = (buckets || []).some((bucket) => bucket.name === bucketName)
  if (!exists) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, { public: false })
    if (createError) throw new Error(createError.message)
  }
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(commonRoles)
  if (error || !session) return error

  const form = await request.formData()
  const file = form.get('file')
  const scope = String(form.get('scope') || '')

  if (!(file instanceof File)) {
    return jsonError('file is required')
  }
  const messageUpload = scope === 'message'
  const coachWaiverUpload = scope === 'coach_waiver'
  const allowedTypes = new Set(messageUpload
    ? ['application/pdf','image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/x-m4v']
    : coachWaiverUpload
      ? ['application/pdf','image/jpeg','image/png','image/heic','image/heif','text/plain','application/rtf','text/rtf','application/octet-stream']
      : ['application/pdf','image/jpeg','image/png','image/webp'])
  const maximumBytes = messageUpload ? 200 * 1024 * 1024 : coachWaiverUpload ? 20 * 1024 * 1024 : 10 * 1024 * 1024
  if (!allowedTypes.has(file.type)) return jsonError(messageUpload ? 'Upload a supported image, video, or PDF file' : coachWaiverUpload ? 'Upload a supported waiver document.' : 'Upload a PDF, JPG, PNG, or WebP file')
  if (file.size <= 0 || file.size > maximumBytes) return jsonError(`File size must be between 1 byte and ${messageUpload ? '200' : coachWaiverUpload ? '20' : '10'} MB`)

  const bucketName = messageUpload ? 'private-athlete-media' : coachWaiverUpload ? 'coach-waivers' : 'attachments'

  try {
    await ensureBucket(bucketName)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not setup bucket', 500)
  }

  const userId = session.user.id
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '')}` : ''
  const filePath = messageUpload
    ? `${userId}/messages/${crypto.randomUUID()}${extension}`
    : `${userId}/${Date.now()}-${file.name.replace(/\s+/g, '_')}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucketName)
    .upload(filePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })

  if (uploadError) {
    return jsonError(uploadError.message, 500)
  }

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(bucketName)
    .createSignedUrl(filePath, 5 * 60)

  if (signedError || !signedData) {
    await supabaseAdmin.storage.from(bucketName).remove([filePath])
    return jsonError(signedError?.message || 'Could not create signed URL', 500)
  }

  if (scope === 'org_compliance') {
    const orgId = await resolveActiveOrganizationId(userId)
    if (!orgId) {
      await supabaseAdmin.storage.from(bucketName).remove([filePath])
      return jsonError('Organization not found', 404)
    }
    const { data: upload, error: recordError } = await supabaseAdmin
      .from('org_compliance_uploads')
      .insert({ org_id: orgId, uploaded_by: userId, file_path: filePath, file_name: file.name, file_type: file.type, file_size: file.size })
      .select('id')
      .single()
    if (recordError || !upload) {
      await supabaseAdmin.storage.from(bucketName).remove([filePath])
      return jsonError('Unable to save the compliance upload', 500)
    }
    return NextResponse.json({ id: upload.id, bucket: bucketName, path: filePath, url: signedData.signedUrl, name: file.name, type: file.type, size: file.size })
  }

  return NextResponse.json({
    bucket: bucketName,
    path: filePath,
    url: signedData.signedUrl,
    name: file.name,
    type: file.type,
    size: file.size,
  })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole(commonRoles)
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const path = String(body?.path || '').trim()
  const bucket = String(body?.bucket || 'attachments').trim()
  if (!path || !['attachments', 'private-athlete-media'].includes(bucket)) {
    return jsonError('A valid attachment path and bucket are required')
  }
  if (!path.startsWith(`${session.user.id}/`)) {
    return jsonError('Forbidden', 403)
  }

  const { error: removeError } = await supabaseAdmin.storage.from(bucket).remove([path])
  if (removeError) return jsonError(removeError.message, 500)
  return NextResponse.json({ deleted: true })
}
