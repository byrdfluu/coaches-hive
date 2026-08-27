import { NextResponse } from 'next/server'
import { dispatchDueFamilyInstallments } from '@/lib/familyPaymentPlans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const authorized = (request: Request) => {
  const secret = process.env.REMINDER_CRON_SECRET || process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('x-reminder-secret') === secret || request.headers.get('authorization') === `Bearer ${secret}`
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await dispatchDueFamilyInstallments())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to dispatch family installments' }, { status: 500 })
  }
}

export const GET = run
export const POST = run
