import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

async function ownedProfile(userId: string) {
  return supabaseAdmin.from('athlete_profiles').select('id, city, state, zip_code').eq('owner_user_id', userId).order('created_at').limit(1).maybeSingle()
}

export async function GET() {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const { data, error: queryError } = await ownedProfile(session.user.id)
  if (queryError) return jsonError('Unable to load discovery preferences', 500)
  return NextResponse.json({ profile: data || { city: '', state: '', zip_code: '' } })
}

export async function PATCH(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const city = clean(body.city, 80)
  const state = clean(body.state, 2).toUpperCase()
  const zip_code = clean(body.zip_code, 10)
  if (state && !/^[A-Z]{2}$/.test(state)) return jsonError('State must use a two-letter abbreviation')
  if (zip_code && !/^\d{5}$/.test(zip_code)) return jsonError('Enter a five-digit ZIP code')
  const profile = await ownedProfile(session.user.id)
  if (!profile.data?.id) return jsonError('Athlete profile not found', 404)
  const { data, error: updateError } = await supabaseAdmin.from('athlete_profiles').update({ city, state, zip_code }).eq('id', profile.data.id).select('id, city, state, zip_code').single()
  if (updateError) return jsonError('Unable to save discovery preferences', 500)
  return NextResponse.json({ profile: data })
}
