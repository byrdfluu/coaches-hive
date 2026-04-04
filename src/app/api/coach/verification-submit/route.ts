import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const listVerificationDocCount = async (userId: string, category: 'gov_id' | 'certifications') => {
  const { data, error } = await supabaseAdmin.storage
    .from('verifications')
    .list(`${userId}/${category}`, { limit: 100, sortBy: { column: 'name', order: 'desc' } })

  if (error || !data) return 0

  return data.filter((item) => Boolean(item?.name) && item.name !== '.emptyFolderPlaceholder').length
}

export async function POST() {
  if (!hasSupabaseAdminConfig) {
    return jsonError('Service unavailable', 503)
  }

  const { session, role, error } = await getSessionRole(['coach'])
  if (error || !session || role !== 'coach') {
    return jsonError('Unauthorized', 401)
  }

  const userId = session.user.id
  const [idDocCount, certificationCount] = await Promise.all([
    listVerificationDocCount(userId, 'gov_id'),
    listVerificationDocCount(userId, 'certifications'),
  ])

  if (idDocCount === 0 && certificationCount === 0) {
    return jsonError('Upload verification documents before submitting.', 400)
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      verification_status: 'pending',
      verification_submitted_at: new Date().toISOString(),
      verification_reviewed_at: null,
      verification_reviewed_by: null,
      has_id_document: idDocCount > 0,
      has_certifications: certificationCount > 0,
    })
    .eq('id', userId)
    .eq('role', 'coach')
    .select('id, verification_status, verification_submitted_at, has_id_document, has_certifications')
    .single()

  if (updateError || !data) {
    return jsonError(updateError?.message || 'Unable to submit verification.', 500)
  }

  return NextResponse.json({ ok: true, profile: data })
}
