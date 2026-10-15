import { NextResponse } from 'next/server'
import { getPostHogClient } from '@/lib/posthog-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PII_KEY = /(name|email|phone|address|birth|token|secret|password)/i
const safeProperties = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, entry]) =>
    !PII_KEY.test(key) && (entry === null || ['string','number','boolean'].includes(typeof entry))))
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data, error } = await (supabaseAdmin as any).from('product_lifecycle_events')
    .select('event_key,event_name,org_id,actor_user_id,subject_type,subject_id,properties,occurred_at')
    .order('occurred_at', { ascending: false }).limit(1000)
  if (error) {
    console.error('[cron/product-lifecycle-analytics] load failed', { code: error.code })
    return NextResponse.json({ error: 'Lifecycle analytics could not be loaded.' }, { status: 503 })
  }
  const posthog = getPostHogClient()
  for (const row of data || []) {
    posthog.capture({
      distinctId: row.actor_user_id || (row.org_id ? `org:${row.org_id}` : 'coaches-hive-system'),
      event: row.event_name,
      properties: { ...safeProperties(row.properties), org_id: row.org_id || null,
        subject_type: row.subject_type || null, subject_id: row.subject_id || null,
        occurred_at: row.occurred_at, event_key: row.event_key, $insert_id: row.event_key },
    })
  }
  await posthog.flush?.()
  return NextResponse.json({ delivered: (data || []).length, idempotency: 'event_key' })
}
