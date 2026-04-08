import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { getOperationsConfig } from '@/lib/operations'
import { logAdminAction } from '@/lib/auditLog'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

type UptimeSample = {
  created_at: string
  web_ok: boolean
  api_ok: boolean
  db_ok: boolean
  web_latency_ms: number | null
  api_latency_ms: number | null
  db_latency_ms: number | null
}

type UptimeIncident = {
  time: string
  title: string
  detail: string
}

type UptimeConfig = {
  uptimeStats?: Array<{ label: string; value: string }>
  incidents?: UptimeIncident[]
  samples?: UptimeSample[]
  checks?: Array<{
    id: 'web' | 'api' | 'db'
    label: string
    status: 'up' | 'down'
    latency_ms: number | null
    detail: string
  }>
  sentry?: {
    enabled: boolean
    last_sync_at: string | null
    last_error: string | null
    open_issue_count: number
  }
}

const SAMPLE_INTERVAL_MS = 5 * 60 * 1000
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const MAX_SAMPLES = 7 * 24 * 12 + 100

const clampBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback

const clampNumber = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeSamples = (value: unknown): UptimeSample[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((sample) => {
      const source = (sample && typeof sample === 'object' ? sample : {}) as Record<string, unknown>
      const createdAt = typeof source.created_at === 'string' ? source.created_at : ''
      const parsed = new Date(createdAt)
      if (!createdAt || Number.isNaN(parsed.getTime())) return null
      return {
        created_at: parsed.toISOString(),
        web_ok: clampBoolean(source.web_ok),
        api_ok: clampBoolean(source.api_ok),
        db_ok: clampBoolean(source.db_ok),
        web_latency_ms: clampNumber(source.web_latency_ms),
        api_latency_ms: clampNumber(source.api_latency_ms),
        db_latency_ms: clampNumber(source.db_latency_ms),
      }
    })
    .filter(Boolean) as UptimeSample[]
}

const formatRelativeTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const deltaMs = Date.now() - date.getTime()
  if (deltaMs < 0) return 'just now'
  const minutes = Math.floor(deltaMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const uptimePercent = (samples: UptimeSample[], selector: (sample: UptimeSample) => boolean, fallback: boolean) => {
  if (samples.length === 0) {
    return fallback ? '100.00%' : '0.00%'
  }
  const hits = samples.filter(selector).length
  return `${((hits / samples.length) * 100).toFixed(2)}%`
}

const timedFetch = async (url: string, init: RequestInit, timeoutMs = 7000) => {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    })
    return {
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      latency_ms: Date.now() - startedAt,
      data: await response.json().catch(() => null),
      error: null as string | null,
    }
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      latency_ms: Date.now() - startedAt,
      data: null as any,
      error: error?.message || 'request_failed',
    }
  } finally {
    clearTimeout(timer)
  }
}

const timedDbProbe = async () => {
  const startedAt = Date.now()
  try {
    const { error } = await supabaseAdmin
      .from('admin_configs')
      .select('key')
      .limit(1)
    return {
      ok: !error,
      latency_ms: Date.now() - startedAt,
      error: error?.message || null,
    }
  } catch (error: any) {
    return {
      ok: false,
      latency_ms: Date.now() - startedAt,
      error: error?.message || 'db_probe_failed',
    }
  }
}

const getSentryIncidents = async () => {
  const token = String(process.env.SENTRY_AUTH_TOKEN || '').trim()
  const orgSlug = String(process.env.SENTRY_ORG_SLUG || '').trim()
  const projectSlug = String(process.env.SENTRY_PROJECT_SLUG || '').trim()
  const baseUrl = String(process.env.SENTRY_BASE_URL || 'https://sentry.io').replace(/\/+$/, '')

  if (!token || !orgSlug || !projectSlug) {
    return {
      incidents: [] as Array<{ at_ms: number; item: UptimeIncident }>,
      meta: {
        enabled: false,
        error: 'Sentry env missing (SENTRY_AUTH_TOKEN / SENTRY_ORG_SLUG / SENTRY_PROJECT_SLUG).',
        open_issue_count: 0,
      },
    }
  }

  const endpoint = `${baseUrl}/api/0/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectSlug)}/issues/?query=is:unresolved&sort=date&limit=8`
  const response = await timedFetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok || !Array.isArray(response.data)) {
    return {
      incidents: [] as Array<{ at_ms: number; item: UptimeIncident }>,
      meta: {
        enabled: true,
        error: response.error || `Sentry API returned status ${response.status}`,
        open_issue_count: 0,
      },
    }
  }

  const incidents = response.data
    .map((issue: any) => {
      const lastSeenRaw = issue?.lastSeen || issue?.last_seen || issue?.last_seen_at || null
      const lastSeen = lastSeenRaw ? new Date(lastSeenRaw) : null
      const atMs = lastSeen && !Number.isNaN(lastSeen.getTime()) ? lastSeen.getTime() : Date.now()
      const level = String(issue?.level || 'error').toUpperCase()
      const count = Number(issue?.count || 0)
      const title = String(issue?.title || issue?.shortId || 'Sentry issue').trim() || 'Sentry issue'
      const culprit = String(issue?.culprit || '').trim()
      const detailParts = [
        `Sentry ${level}`,
        Number.isFinite(count) && count > 0 ? `${count} events` : null,
        culprit || null,
      ].filter(Boolean)
      const detail = detailParts.join(' · ')
      return {
        at_ms: atMs,
        item: {
          time: formatRelativeTime(lastSeen?.toISOString() || null),
          title,
          detail,
        },
      }
    })
    .slice(0, 8)

  return {
    incidents,
    meta: {
      enabled: true,
      error: null as string | null,
      open_issue_count: incidents.length,
    },
  }
}

const requireAdmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401) }
  }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'ops' && adminAccess.teamRole !== 'superadmin') {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

export async function GET(request: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const now = new Date()
  const nowIso = now.toISOString()
  const currentConfig = (await getAdminConfig<UptimeConfig>('uptime')) || {}
  const historyCutoff = Date.now() - HISTORY_WINDOW_MS
  const normalizedSamples = normalizeSamples(currentConfig.samples).filter(
    (sample) => new Date(sample.created_at).getTime() >= historyCutoff,
  )

  const cookieHeader = request.headers.get('cookie') || ''
  const origin = new URL(request.url).origin

  const [webProbe, apiProbe, dbProbe, operationsConfig, sentryData] = await Promise.all([
    timedFetch(`${origin}/login`, { method: 'GET' }),
    timedFetch(`${origin}/api/admin/env-check`, {
      method: 'GET',
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    }),
    timedDbProbe(),
    getOperationsConfig().catch(() => null),
    getSentryIncidents(),
  ])

  const latestSample: UptimeSample = {
    created_at: nowIso,
    web_ok: webProbe.ok,
    api_ok: apiProbe.ok,
    db_ok: dbProbe.ok,
    web_latency_ms: webProbe.latency_ms,
    api_latency_ms: apiProbe.latency_ms,
    db_latency_ms: dbProbe.latency_ms,
  }

  const nextSamples = normalizedSamples.slice()
  const lastSample = nextSamples[nextSamples.length - 1]
  if (!lastSample) {
    nextSamples.push(latestSample)
  } else {
    const lastTs = new Date(lastSample.created_at).getTime()
    if (Number.isNaN(lastTs) || Date.now() - lastTs >= SAMPLE_INTERVAL_MS) {
      nextSamples.push(latestSample)
    } else {
      nextSamples[nextSamples.length - 1] = latestSample
    }
  }
  while (nextSamples.length > MAX_SAMPLES) {
    nextSamples.shift()
  }

  const recentSamples = nextSamples.filter((sample) => new Date(sample.created_at).getTime() >= historyCutoff)
  const apiUptime = uptimePercent(recentSamples, (sample) => sample.api_ok && sample.db_ok, latestSample.api_ok && latestSample.db_ok)
  const webUptime = uptimePercent(recentSamples, (sample) => sample.web_ok, latestSample.web_ok)
  const dbUptime = uptimePercent(recentSamples, (sample) => sample.db_ok, latestSample.db_ok)

  const opsIncidents = (operationsConfig?.incidentFeed || [])
    .filter((incident: any) => String(incident.status || '').toLowerCase() !== 'resolved')
    .map((incident: any) => {
      const createdAt = String(incident.created_at || '')
      const date = new Date(createdAt)
      const atMs = Number.isNaN(date.getTime()) ? Date.now() : date.getTime()
      const severity = String(incident.severity || 'medium').toUpperCase()
      return {
        at_ms: atMs,
        item: {
          time: formatRelativeTime(createdAt || null),
          title: String(incident.title || 'Operations incident'),
          detail: `Operations ${severity} · ${String(incident.detail || '').trim() || 'No additional detail.'}`,
        } as UptimeIncident,
      }
    })

  const mergedIncidents = [...sentryData.incidents, ...opsIncidents]
    .sort((a, b) => b.at_ms - a.at_ms)
    .slice(0, 8)
    .map((entry) => entry.item)

  const incidents = mergedIncidents.length > 0
    ? mergedIncidents
    : (Array.isArray(currentConfig.incidents) ? currentConfig.incidents : []).slice(0, 8)

  const lastIncidentLabel = incidents.length > 0 ? incidents[0].time : 'No recent incidents'
  const uptimeStats = [
    { label: 'API uptime (7d)', value: apiUptime },
    { label: 'Web uptime (7d)', value: webUptime },
    { label: 'DB uptime (7d)', value: dbUptime },
    { label: 'Last incident', value: lastIncidentLabel },
  ]

  const checks = [
    {
      id: 'web' as const,
      label: 'Web probe',
      status: webProbe.ok ? 'up' as const : 'down' as const,
      latency_ms: webProbe.latency_ms,
      detail: webProbe.ok ? `HTTP ${webProbe.status}` : (webProbe.error || `HTTP ${webProbe.status}`),
    },
    {
      id: 'api' as const,
      label: 'API probe',
      status: apiProbe.ok ? 'up' as const : 'down' as const,
      latency_ms: apiProbe.latency_ms,
      detail: apiProbe.ok ? `HTTP ${apiProbe.status}` : (apiProbe.error || `HTTP ${apiProbe.status}`),
    },
    {
      id: 'db' as const,
      label: 'DB probe',
      status: dbProbe.ok ? 'up' as const : 'down' as const,
      latency_ms: dbProbe.latency_ms,
      detail: dbProbe.ok ? 'Supabase query ok' : String(dbProbe.error || 'Database probe failed'),
    },
  ]

  const nextConfig: UptimeConfig = {
    ...currentConfig,
    uptimeStats,
    incidents,
    checks,
    samples: nextSamples,
    sentry: {
      enabled: sentryData.meta.enabled,
      last_sync_at: nowIso,
      last_error: sentryData.meta.error,
      open_issue_count: sentryData.meta.open_issue_count,
    },
  }

  try {
    await setAdminConfig('uptime', nextConfig as Record<string, any>)
  } catch {
    // If persistence fails, still return computed live data for the current request.
  }

  return NextResponse.json({ config: nextConfig })
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const payload = await request.json().catch(() => ({}))
  const data = payload?.data ?? payload?.config
  if (!data) {
    return jsonError('config data is required')
  }

  await setAdminConfig('uptime', data)
  await logAdminAction({
    action: 'admin.uptime.update',
    actorId: session?.user.id,
    actorEmail: session?.user.email || null,
    targetType: 'admin_config',
    targetId: 'uptime',
  })
  return NextResponse.json({ config: data })
}
