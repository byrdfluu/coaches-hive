import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const asOf = new Date().toISOString()
  const [{ data: offeringExpired, error: offeringError }, { data: trainingExpired, error: trainingError }] = await Promise.all([
    (supabaseAdmin as any).rpc('expire_org_offering_credits', { p_as_of: asOf }),
    (supabaseAdmin as any).rpc('expire_org_training_credits', { p_as_of: asOf }),
  ])
  if (offeringError || trainingError) {
    console.error('[cron/credit-expiration] expiration failed', { offering: offeringError?.code, training: trainingError?.code })
    return NextResponse.json({ error: 'Credit expiration could not be completed.' }, { status: 503 })
  }
  return NextResponse.json({ offering_expired: Number(offeringExpired || 0), training_expired: Number(trainingExpired || 0), as_of: asOf })
}
