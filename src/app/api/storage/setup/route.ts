import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
export const dynamic = 'force-dynamic'


const ensureBucket = async (name: string, isPublic: boolean) => {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets()
  if (error) throw new Error(error.message)
  const exists = (buckets || []).some((bucket) => bucket.name === name)
  if (!exists) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(name, {
      public: isPublic,
    })
    if (createError) throw new Error(createError.message)
  }
}

export async function POST() {
  const { error } = await getSessionRole(['admin'])
  if (error) return error
  try {
    await ensureBucket('avatars', true)
    await ensureBucket('attachments', false)
    await ensureBucket('branding', true)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to setup storage', 500)
  }
}
