import { NextResponse } from 'next/server'
import { getSessionRole, jsonError, commonRoles } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveOrganizationId } from '@/lib/activeOrganization'
export const dynamic = 'force-dynamic'


const ensureBucket = async () => {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets()
  if (error) throw new Error(error.message)
  const exists = (buckets || []).some((bucket) => bucket.name === 'attachments')
  if (!exists) {
    const { error: createError } = await supabaseAdmin.storage.createBucket('attachments', {
      public: false,
    })
    if (createError) throw new Error(createError.message)
  }
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(commonRoles)
  if (error || !session) return error

  const form = await request.formData()
  const file = form.get('file')
  const scope = form.get('scope')

  if (!(file instanceof File)) {
    return jsonError('file is required')
  }
  const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  if (!allowedTypes.has(file.type)) return jsonError('Upload a PDF, JPG, PNG, or WebP file')
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) return jsonError('File size must be between 1 byte and 10 MB')

  try {
    await ensureBucket()
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not setup bucket', 500)
  }

  const userId = session.user.id
  const filePath = `${userId}/${Date.now()}-${file.name.replace(/\s+/g, '_')}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('attachments')
    .upload(filePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })

  if (uploadError) {
    return jsonError(uploadError.message, 500)
  }

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from('attachments')
    .createSignedUrl(filePath, 60 * 60 * 24 * 7)

  if (signedError || !signedData) {
    await supabaseAdmin.storage.from('attachments').remove([filePath])
    return jsonError(signedError?.message || 'Could not create signed URL', 500)
  }

  if (scope === 'org_compliance') {
    const orgId = await resolveActiveOrganizationId(userId)
    if (!orgId) {
      await supabaseAdmin.storage.from('attachments').remove([filePath])
      return jsonError('Organization not found', 404)
    }
    const { data: upload, error: recordError } = await supabaseAdmin
      .from('org_compliance_uploads')
      .insert({ org_id: orgId, uploaded_by: userId, file_path: filePath, file_name: file.name, file_type: file.type, file_size: file.size })
      .select('id')
      .single()
    if (recordError || !upload) {
      await supabaseAdmin.storage.from('attachments').remove([filePath])
      return jsonError('Unable to save the compliance upload', 500)
    }
    return NextResponse.json({ id: upload.id, path: filePath, url: signedData.signedUrl, name: file.name, type: file.type, size: file.size })
  }

  return NextResponse.json({
    path: filePath,
    url: signedData.signedUrl,
    name: file.name,
    type: file.type,
    size: file.size,
  })
}
