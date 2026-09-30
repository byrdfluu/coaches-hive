import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const authorized = (request: Request) => {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

async function cleanup(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: uploads, error } = await supabaseAdmin.from('org_enrollment_document_uploads')
    .select('id,storage_path').is('submission_id', null).lt('created_at', cutoff).order('created_at').limit(100)
  if (error) return NextResponse.json({ error: 'Unable to load abandoned uploads.' }, { status: 500 })

  let deleted = 0
  let failed = 0
  for (const upload of uploads || []) {
    const { data: claimed, error: deleteError } = await supabaseAdmin.from('org_enrollment_document_uploads')
      .delete().eq('id', upload.id).is('submission_id', null).select('id,storage_path').maybeSingle()
    if (deleteError) {
      failed++
      continue
    }
    if (!claimed) continue
    const { error: storageError } = await supabaseAdmin.storage.from('registration-documents').remove([claimed.storage_path])
    if (storageError) failed++
    else deleted++
  }
  return NextResponse.json({ scanned: (uploads || []).length, deleted, failed, cutoff })
}

export async function GET(request: Request) {
  return cleanup(request)
}

export async function POST(request: Request) {
  return cleanup(request)
}
