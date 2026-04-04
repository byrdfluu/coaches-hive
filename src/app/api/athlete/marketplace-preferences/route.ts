import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const sanitizeStringList = (value: unknown, maxItems: number, maxLength: number) => {
  if (!Array.isArray(value)) return []
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .map((item) => item.slice(0, maxLength))

  return Array.from(new Set(normalized)).slice(0, maxItems)
}

const sanitizePreferences = (value: unknown) => {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    recent_searches: sanitizeStringList(input.recent_searches, 5, 100),
    saved_ids: sanitizeStringList(input.saved_ids, 100, 64),
    recently_viewed: sanitizeStringList(input.recently_viewed, 12, 64),
  }
}

export async function GET() {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const { data: profile, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('marketplace_preferences')
    .eq('id', session.user.id)
    .maybeSingle()

  if (fetchError) {
    return jsonError(fetchError.message, 500)
  }

  return NextResponse.json({
    preferences: sanitizePreferences(profile?.marketplace_preferences),
  })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const preferences = sanitizePreferences(body?.preferences)

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      marketplace_preferences: preferences,
    })
    .eq('id', session.user.id)

  if (updateError) {
    return jsonError(updateError.message, 500)
  }

  return NextResponse.json({ ok: true, preferences })
}
