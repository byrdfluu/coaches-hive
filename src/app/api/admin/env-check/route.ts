import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
export const dynamic = 'force-dynamic'


const decodePayload = (key: string) => {
  const parts = key.split('.')
  if (parts.length < 2) return null
  try {
    const payload = Buffer.from(parts[1], 'base64').toString('utf8')
    return JSON.parse(payload)
  } catch {
    return null
  }
}

const extractRefFromUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname || ''
    const [ref] = host.split('.')
    return ref || null
  } catch {
    return null
  }
}

export async function GET() {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)
  if (!session.user) {
    return jsonError('Unauthorized', 401)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const urlRef = extractRefFromUrl(url)
  const decoded = key ? decodePayload(key) : null
  const keyRef = decoded?.ref || null
  const keyRole = decoded?.role || null

  return NextResponse.json({
    hasSupabaseUrl: Boolean(url),
    supabaseUrlRef: urlRef,
    hasServiceRoleKey: Boolean(key),
    serviceRoleKeyLength: key.length,
    serviceRoleKeyRef: keyRef,
    serviceRoleKeyRole: keyRole,
  })
}
