import { NextResponse } from 'next/server'
import { getSessionRole, jsonError, commonRoles } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_FILES_PER_REQUEST = 10

export async function GET() {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const { data, error: documentsError } = await supabaseAdmin
    .from('verification_documents')
    .select('id,category,storage_path,original_filename,mime_type,size_bytes,created_at')
    .eq('owner_user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (documentsError) return jsonError(documentsError.message, 500)

  const rows = data || []
  const { data: signedRows } = rows.length
    ? await supabaseAdmin.storage.from('verifications').createSignedUrls(rows.map((row) => row.storage_path), 5 * 60)
    : { data: [] }
  return NextResponse.json({
    documents: rows.map((row, index) => ({ ...row, signed_url: signedRows?.[index]?.signedUrl || null })),
  })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const formData = await request.formData()
  const type = String(formData.get('type') || 'document')
  if (!['gov_id', 'certifications'].includes(type)) {
    return jsonError('type must be gov_id or certifications')
  }

  const files = formData.getAll('files')
  const singleFile = formData.get('file')

  const uploadFiles = [] as File[]
  if (singleFile && singleFile instanceof File) {
    uploadFiles.push(singleFile)
  }
  files.forEach((file) => {
    if (file instanceof File) uploadFiles.push(file)
  })

  if (uploadFiles.length === 0) {
    return jsonError('No files provided')
  }
  if (uploadFiles.length > MAX_FILES_PER_REQUEST) {
    return jsonError(`Upload no more than ${MAX_FILES_PER_REQUEST} files at once.`)
  }
  for (const file of uploadFiles) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return jsonError(`${file.name} has an unsupported file type.`)
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return jsonError(`${file.name} must be between 1 byte and 20 MB.`)
    }
  }

  const bucket = 'verifications'
  const { data: buckets } = await supabaseAdmin.storage.listBuckets()
  if (!buckets?.find((b) => b.name === bucket)) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
      public: false,
    })
    if (createError) return jsonError(createError.message)
  }

  const uploaded: Array<{
    path: string
    name: string
    type: string
    mime_type: string
    size_bytes: number
    signed_url: string | null
  }> = []
  for (const file of uploadFiles) {
    const extension = file.name.split('.').pop() || 'dat'
    const path = `${session.user.id}/${type}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      if (uploaded.length) {
        const uploadedPaths = uploaded.map((item) => item.path)
        await Promise.all([
          supabaseAdmin.storage.from(bucket).remove(uploadedPaths),
          supabaseAdmin.from('verification_documents').delete().in('storage_path', uploadedPaths),
        ])
      }
      return jsonError(uploadError.message)
    }

    const { error: metadataError } = await supabaseAdmin.from('verification_documents').insert({
      owner_user_id: session.user.id,
      category: type,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    })
    if (metadataError) {
      await supabaseAdmin.storage.from(bucket).remove([...uploaded.map((item) => item.path), path])
      if (uploaded.length) {
        await supabaseAdmin.from('verification_documents').delete().in('storage_path', uploaded.map((item) => item.path))
      }
      return jsonError(metadataError.message, 500)
    }
    const { data: signed } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 5 * 60)
    uploaded.push({
      path,
      name: file.name,
      type,
      mime_type: file.type,
      size_bytes: file.size,
      signed_url: signed?.signedUrl || null,
    })
  }

  return NextResponse.json({ uploaded })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const path = String((await request.json().catch(() => null))?.path || '').trim()
  if (!path.startsWith(`${session.user.id}/`)) return jsonError('Forbidden', 403)

  const { data: document } = await supabaseAdmin
    .from('verification_documents')
    .select('id,storage_path')
    .eq('owner_user_id', session.user.id)
    .eq('storage_path', path)
    .maybeSingle()
  if (!document) return jsonError('Verification document not found', 404)

  const { error: storageError } = await supabaseAdmin.storage.from('verifications').remove([path])
  if (storageError) return jsonError(storageError.message, 500)
  const { error: deleteError } = await supabaseAdmin.from('verification_documents').delete().eq('id', document.id)
  if (deleteError) return jsonError(deleteError.message, 500)
  return NextResponse.json({ deleted: true })
}
