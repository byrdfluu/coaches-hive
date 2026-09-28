import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/

export const requestIdFor = (request: Request): string => {
  const supplied = String(request.headers.get('x-request-id') || '').trim()
  return REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID()
}

export const correlatedError = (
  requestId: string,
  code: string,
  message: string,
  status: number,
  retryable = status === 429 || status >= 500,
) => NextResponse.json(
  { error: { code, message, retryable, request_id: requestId } },
  { status, headers: { 'X-Coaches-Hive-Support-Reference': requestId } },
)

export const idempotencyKeyFor = (request: Request, body: Record<string, unknown>) => {
  const header = String(request.headers.get('idempotency-key') || '').trim()
  const bodyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : ''
  if (!IDEMPOTENCY_KEY_PATTERN.test(header)) return { error: 'missing' as const }
  if (bodyKey && bodyKey !== header) return { error: 'conflict' as const }
  return { key: header }
}

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'idempotency_key')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)]),
  )
  return value
}

export const requestFingerprint = (body: Record<string, unknown>) =>
  createHash('sha256').update(JSON.stringify(stable(body))).digest('hex')

type IdempotencyReplay = { kind: 'replay'; response: NextResponse }
  | { kind: 'conflict' }
  | { kind: 'processing' }
  | { kind: 'started'; id: string }

export async function beginIdempotentRequest(input: {
  actorUserId: string
  action: string
  resourceId: string
  key: string
  fingerprint: string
  requestId: string
}): Promise<IdempotencyReplay> {
  const lookup = () => supabaseAdmin.from('api_idempotency_records')
    .select('id,request_fingerprint,status,response_status,response_body,response_headers')
    .eq('actor_user_id', input.actorUserId).eq('action', input.action)
    .eq('resource_id', input.resourceId).eq('idempotency_key', input.key).maybeSingle()
  let { data: existing } = await lookup()
  if (!existing) {
    const inserted = await supabaseAdmin.from('api_idempotency_records').insert({
      actor_user_id: input.actorUserId,
      action: input.action,
      resource_id: input.resourceId,
      idempotency_key: input.key,
      request_fingerprint: input.fingerprint,
      request_id: input.requestId,
      status: 'processing',
    }).select('id').single()
    if (!inserted.error && inserted.data) return { kind: 'started', id: inserted.data.id }
    if (inserted.error?.code !== '23505') throw new Error('Unable to reserve idempotent request')
    ;({ data: existing } = await lookup())
  }
  if (!existing || existing.request_fingerprint !== input.fingerprint) return { kind: 'conflict' }
  if (existing.status !== 'completed' || !existing.response_status || !existing.response_body) return { kind: 'processing' }
  const response = NextResponse.json(existing.response_body, { status: existing.response_status })
  const headers = existing.response_headers && typeof existing.response_headers === 'object'
    ? existing.response_headers as Record<string, string> : {}
  Object.entries(headers).forEach(([name, value]) => response.headers.set(name, String(value)))
  response.headers.set('X-Coaches-Hive-Support-Reference', input.requestId)
  response.headers.set('X-Idempotent-Replay', 'true')
  return { kind: 'replay', response }
}

export async function completeIdempotentRequest(id: string, response: Response, requestId: string) {
  const body = await response.clone().json().catch(() => ({ ok: response.ok }))
  const headers: Record<string, string> = {}
  for (const name of ['content-type']) {
    const value = response.headers.get(name)
    if (value) headers[name] = value
  }
  const { error } = await supabaseAdmin.from('api_idempotency_records').update({
    status: 'completed',
    response_status: response.status,
    response_body: body,
    response_headers: headers,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'processing')
  if (error) console.error('[idempotency] completion failed', { request_id: requestId, error_code: error.code })
}

export const stripeIdempotencyKeyFrom = (actorUserId: string, action: string, resourceId: string, key: string) =>
  `ch:${createHash('sha256').update(`${actorUserId}:${action}:${resourceId}:${key}`).digest('hex')}`
