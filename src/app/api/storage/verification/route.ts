import { NextResponse } from 'next/server'
import { getSessionRole, jsonError, commonRoles } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const formData = await request.formData()
  const type = String(formData.get('type') || 'document')

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

  const bucket = 'verifications'
  const { data: buckets } = await supabaseAdmin.storage.listBuckets()
  if (!buckets?.find((b) => b.name === bucket)) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
      public: false,
    })
    if (createError) return jsonError(createError.message)
  }

  const uploaded: Array<{ path: string; name: string; type: string }> = []
  for (const file of uploadFiles) {
    const extension = file.name.split('.').pop() || 'dat'
    const path = `${session.user.id}/${type}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, file, { upsert: true })
    if (uploadError) return jsonError(uploadError.message)
    uploaded.push({ path, name: file.name, type })
  }

  return NextResponse.json({ uploaded })
}
