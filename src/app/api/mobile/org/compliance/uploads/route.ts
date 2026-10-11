import { NextResponse } from 'next/server'
import { mobileError, requireMobileOrgAuthority } from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const maxSize = 10 * 1024 * 1024

export async function GET(request: Request) {
  const auth = await requireMobileOrgAuthority(request, 'manage_documents')
  if ('response' in auth) return auth.response
  const { data, error } = await supabaseAdmin.from('org_compliance_uploads')
    .select('id,file_name,file_path,file_type,file_size,created_at,uploaded_by')
    .eq('org_id', auth.orgId).order('created_at', { ascending: false })
  if (error) return mobileError('Unable to load compliance uploads.', 503, true)
  const rows = data || []
  const { data: signed } = rows.length
    ? await supabaseAdmin.storage.from('attachments').createSignedUrls(rows.map((row) => row.file_path), 5 * 60)
    : { data: [] }
  return NextResponse.json({ uploads: rows.map((row, index) => ({
    id: row.id,
    file_name: row.file_name || 'Document',
    file_type: row.file_type,
    file_size: row.file_size,
    created_at: row.created_at,
    signed_url: signed?.[index]?.signedUrl || null,
  })) })
}

export async function POST(request: Request) {
  const auth = await requireMobileOrgAuthority(request, 'manage_documents')
  if ('response' in auth) return auth.response
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return mobileError('Choose a file to upload.')
  if (!allowedTypes.has(file.type)) return mobileError('Upload a PDF, JPG, PNG, or WebP file.')
  if (file.size <= 0 || file.size > maxSize) return mobileError('File size must be between 1 byte and 10 MB.')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-180) || 'document'
  const filePath = `${auth.orgId}/${auth.user.id}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await supabaseAdmin.storage.from('attachments').upload(filePath, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) return mobileError('Unable to upload the compliance file.', 503, true)
  const { data: row, error: recordError } = await supabaseAdmin.from('org_compliance_uploads').insert({
    org_id: auth.orgId,
    uploaded_by: auth.user.id,
    file_path: filePath,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
  }).select('id,file_name,file_type,file_size,created_at').single()
  if (recordError || !row) {
    await supabaseAdmin.storage.from('attachments').remove([filePath])
    return mobileError('Unable to save the compliance upload.', 503, true)
  }
  const { data: signed } = await supabaseAdmin.storage.from('attachments').createSignedUrl(filePath, 5 * 60)
  if (!signed?.signedUrl) {
    await Promise.all([
      supabaseAdmin.from('org_compliance_uploads').delete().eq('id', row.id),
      supabaseAdmin.storage.from('attachments').remove([filePath]),
    ])
    return mobileError('Unable to authorize the uploaded file.', 503, true)
  }
  return NextResponse.json({ upload: { ...row, signed_url: signed.signedUrl } }, { status: 201 })
}

export async function DELETE(request: Request) {
  const auth = await requireMobileOrgAuthority(request, 'manage_documents')
  if ('response' in auth) return auth.response
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return mobileError('Upload id is required.')
  const { data: upload } = await supabaseAdmin.from('org_compliance_uploads').select('id,file_path')
    .eq('id', id).eq('org_id', auth.orgId).maybeSingle()
  if (!upload) return mobileError('Compliance upload not found.', 404, false)
  const { error: deleteError } = await supabaseAdmin.from('org_compliance_uploads').delete()
    .eq('id', upload.id).eq('org_id', auth.orgId)
  if (deleteError) return mobileError('Unable to delete the compliance upload.', 503, true)
  const { error: storageError } = await supabaseAdmin.storage.from('attachments').remove([upload.file_path])
  if (storageError) return mobileError('The upload record was removed, but file cleanup must be retried.', 503, true)
  return NextResponse.json({ deleted: true })
}
