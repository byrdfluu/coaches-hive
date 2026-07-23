import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ALL_ACCESS_PRICING } from '@/lib/allAccessPricing'

const sessionUser = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user || null
}

export async function GET() {
  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin.from('family_subscription_athletes')
    .select('athlete_profile_id, created_at')
    .eq('subscription_owner_id', user.id)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ athletes: data || [], limit: ALL_ACCESS_PRICING.athlete.familyAthleteLimit })
}

export async function POST(request: Request) {
  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const athleteProfileId = String(body?.athlete_profile_id || '')
  const { data: athlete } = await supabaseAdmin.from('athlete_profiles')
    .select('id').eq('id', athleteProfileId).eq('owner_user_id', user.id).maybeSingle()
  if (!athlete) return NextResponse.json({ error: 'Athlete profile not found' }, { status: 404 })
  const { count } = await supabaseAdmin.from('family_subscription_athletes')
    .select('id', { count: 'exact', head: true }).eq('subscription_owner_id', user.id)
  if ((count || 0) >= ALL_ACCESS_PRICING.athlete.familyAthleteLimit) {
    return NextResponse.json({ error: 'Family All Access covers up to four athlete profiles.' }, { status: 409 })
  }
  const { error } = await supabaseAdmin.from('family_subscription_athletes').upsert({
    subscription_owner_id: user.id,
    athlete_profile_id: athleteProfileId,
  }, { onConflict: 'subscription_owner_id,athlete_profile_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const athleteProfileId = String(body?.athlete_profile_id || '')
  const { error } = await supabaseAdmin.from('family_subscription_athletes').delete()
    .eq('subscription_owner_id', user.id).eq('athlete_profile_id', athleteProfileId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
