import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import {
  emptyPlatformSubscriptionSnapshot,
  getPlatformSubscriptionSnapshot,
  resolvePlatformActor,
} from '@/lib/platformSubscription'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const actor = await resolvePlatformActor(user.id)
  if (!actor) return NextResponse.json(emptyPlatformSubscriptionSnapshot())
  return NextResponse.json(await getPlatformSubscriptionSnapshot(actor))
}
