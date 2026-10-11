import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { executeRetentionPolicies } from '@/lib/adminRetention'
export const dynamic = 'force-dynamic'


export async function POST() {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  try {
    return NextResponse.json({ results: await executeRetentionPolicies(session.user.id) })
  } catch (runError) {
    return jsonError(runError instanceof Error ? runError.message : 'Retention run failed', 500)
  }
}
