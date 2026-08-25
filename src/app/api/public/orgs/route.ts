import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  let [
    { data: orgRows, error: orgError },
    { data: settingsRows, error: settingsError },
    { data: teamRows, error: teamError },
    { data: tryoutRows, error: tryoutError },
    { data: enrollmentRows, error: enrollmentError },
  ] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('id, name, org_type, sport_primary, sports_additional, city, state, zip_code'),
    supabaseAdmin
      .from('org_settings')
      .select('org_id, location'),
    supabaseAdmin
      .from('org_teams')
      .select('id, name, org_id, sport, level'),
    supabaseAdmin
      .from('tryout_events')
      .select('id, org_id, name, sport, age_group, event_date, event_time, max_slots, registration_fee_cents, status')
      .eq('status', 'open')
      .order('event_date', { ascending: true }),
    supabaseAdmin
      .from('org_enrollment_forms')
      .select('id, org_id, title, description, slug, sport, age_group, is_active, enrollment_fee_cents')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
  ])

  // Keep discovery available during a rolling deployment where web code may
  // reach an environment before the additive discovery migration/schema reload.
  if (orgError?.code === '42703') {
    const fallback = await supabaseAdmin.from('organizations').select('id, name, org_type')
    orgRows = (fallback.data || []).map((row) => ({
      ...row,
      sport_primary: null,
      sports_additional: [],
      city: null,
      state: null,
      zip_code: null,
    }))
    orgError = fallback.error
  }

  if (enrollmentError) {
    const fallback = await supabaseAdmin
      .from('org_enrollment_forms')
      .select('id, org_id, title, description, slug, sport, age_group, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    enrollmentRows = (fallback.data || []).map((row) => ({ ...row, enrollment_fee_cents: 0 }))
    enrollmentError = fallback.error
  }

  if (orgError || settingsError || teamError || tryoutError || enrollmentError) {
    return NextResponse.json({ error: 'Unable to load organizations.' }, { status: 500 })
  }

  return NextResponse.json({
    organizations: orgRows || [],
    settings: settingsRows || [],
    teams: teamRows || [],
    tryouts: tryoutRows || [],
    enrollments: enrollmentRows || [],
  })
}
