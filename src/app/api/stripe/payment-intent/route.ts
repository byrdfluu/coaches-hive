import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// This legacy endpoint accepted client-authored amounts and seller metadata.
// It is intentionally retired; callers must use an obligation-specific route
// that resolves amount, payer, seller, and destination from authoritative data.
export async function POST() {
  const { session, error } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (error || !session) return error
  return NextResponse.json({
    error: 'This payment endpoint has been retired. Use the authoritative payment checkout endpoint.',
    code: 'endpoint_retired', retryable: false,
  }, { status: 410 })
}
