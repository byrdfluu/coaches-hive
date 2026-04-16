import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const VALID_OPTIONS = [
  'Google / search',
  'Instagram',
  'TikTok',
  'X (Twitter)',
  'YouTube',
  'LinkedIn',
  'A coach recommended it',
  'Word of mouth / friend',
  'Other',
]

export async function POST(request: Request) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  if (!hasSupabaseAdminConfig) return jsonError('Service unavailable', 503)

  const body = await request.json().catch(() => ({}))
  const raw = typeof body?.heard_from === 'string' ? body.heard_from.trim() : ''
  if (!raw) return jsonError('heard_from is required')

  // Allow "Other: <free text>" or any valid option
  const isValid = VALID_OPTIONS.includes(raw) || raw.startsWith('Other: ')
  if (!isValid) return jsonError('Invalid option')

  await supabaseAdmin
    .from('profiles')
    .update({ heard_from: raw })
    .eq('id', session.user.id)

  return NextResponse.json({ ok: true })
}