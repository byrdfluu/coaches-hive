import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { OnboardingAnswers, OnboardingRole } from '@/lib/sharedOnboardingContract'

export const dynamic = 'force-dynamic'
const ORG_ROLES = new Set(['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager'])
const clean = (value: unknown) => typeof value === 'string' ? value.trim() || null : null
const list = (value: unknown) => Array.isArray(value) ? value.map(String).map((v) => v.trim()).filter(Boolean) : []
const years = (value: unknown) => { const v = clean(value) || ''; return v.startsWith('1') ? 1 : v.startsWith('3') ? 3 : v.startsWith('6') ? 6 : v.startsWith('10') ? 10 : null }

const auth = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  return { supabase, session }
}

const resolveContext = async (user: any) => {
  const metadata = user.user_metadata || {}
  const rawRole = String(metadata.active_role || metadata.role || '')
  const { data: membership } = await supabaseAdmin.from('organization_memberships').select('org_id,role').eq('user_id', user.id).eq('status','active').limit(1).maybeSingle()
  const role: OnboardingRole = ORG_ROLES.has(rawRole) ? 'org_director' : rawRole === 'athlete' ? 'athlete' : membership?.org_id ? 'org_coach' : 'solo_coach'
  return { role, orgId: membership?.org_id || metadata.current_org_id || null }
}

export async function GET() {
  const { session } = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await resolveContext(session.user)
  const metadata = session.user.user_metadata || {}
  return NextResponse.json({
    role: context.role,
    org_id: context.orgId,
    answers: (metadata.onboarding_answers || {}) as OnboardingAnswers,
    prepaywall_complete: Boolean(metadata.prepaywall_onboarding_complete),
    completed: Boolean(metadata.onboarding_completed_at),
  })
}

export async function PUT(request: Request) {
  const { supabase, session } = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const answers = body.answers && typeof body.answers === 'object' ? body.answers as OnboardingAnswers : {}
  const complete = body.complete === true
  const prepaywallComplete = body.prepaywall_complete === true
  const context = await resolveContext(session.user)
  const requestedRole = String(body.role || '') as OnboardingRole
  if (requestedRole && requestedRole !== context.role) return NextResponse.json({ error: 'Role does not match the authenticated workspace.' }, { status: 403 })

  const nextMetadata = {
    ...(session.user.user_metadata || {}),
    onboarding_answers: answers,
    onboarding_role: context.role,
    prepaywall_onboarding_complete: prepaywallComplete || Boolean(session.user.user_metadata?.prepaywall_onboarding_complete),
    ...(complete ? { onboarding_completed_at: new Date().toISOString() } : {}),
  }
  const { error: metadataError } = await supabase.auth.updateUser({ data: nextMetadata })
  if (metadataError) return NextResponse.json({ error: metadataError.message }, { status: 500 })
  if (!complete) return NextResponse.json({ saved: true, role: context.role })

  const referralSource = clean(answers.referralSource)
  if (context.role === 'solo_coach' || context.role === 'org_coach') {
    const profileUpdate = {
      sport: clean(answers.sport), location: clean(answers.location), bio: clean(answers.bio),
      coaching_philosophy: clean(answers.philosophy), specialties: list(answers.specialties),
      age_groups: list(answers.ageGroups), competition_levels: list(answers.levels),
      certifications: list(answers.certifications), coaching_experience_years: years(answers.experience),
      ...(referralSource ? { referral_source: referralSource } : {}),
    }
    const { error } = await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', session.user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (context.role === 'solo_coach') {
      const modality = clean(answers.modality)
      const { error: independentError } = await supabaseAdmin.from('independent_coach_profiles').upsert({
        coach_id: session.user.id, is_active: true,
        booking_enabled: clean(answers.accepting) === 'Yes', session_policy: clean(answers.policy), trial_policy: clean(answers.trial),
        services: list(answers.services), training_locations: list(answers.locations),
        remote_available: modality !== 'In-Person', in_person_available: modality !== 'Remote',
      }, { onConflict: 'coach_id' })
      if (independentError) return NextResponse.json({ error: independentError.message }, { status: 500 })
    }
  } else if (context.role === 'org_director') {
    if (!context.orgId) return NextResponse.json({ error: 'Organization membership is required.' }, { status: 409 })
    const achievements = list(answers.achievements)
    const facilities = list(answers.facilities)
    const { error } = await supabaseAdmin.from('org_settings').upsert({
      org_id: context.orgId, org_name: clean(answers.orgName), description: clean(answers.about),
      location: clean(answers.location), service_area: clean(answers.serviceArea), sports: list(answers.sports),
      programs: list(answers.programs), age_groups: list(answers.ageGroups), competition_levels: list(answers.levels),
      facilities, practice_locations: facilities, season_start: clean(answers.seasonStart), season_end: clean(answers.seasonEnd),
      registration_status: (clean(answers.registration) || 'closed').toLowerCase(), pricing_summary: clean(answers.pricing),
      primary_contact_email: clean(answers.email), public_phone: clean(answers.phone), website_url: clean(answers.website),
      achievements, affiliations: achievements,
    }, { onConflict: 'org_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (referralSource) await supabaseAdmin.from('profiles').update({ referral_source: referralSource }).eq('id', session.user.id)
  } else {
    const { data: existing } = await supabaseAdmin.from('athlete_profiles').select('id').eq('owner_user_id', session.user.id).order('is_primary', { ascending: false }).limit(1).maybeSingle()
    const athleteValues = { owner_user_id: session.user.id, full_name: clean(answers.name) || session.user.user_metadata?.full_name || 'Athlete', sport: clean(answers.sport), grade_level: clean(answers.grade), birthdate: clean(session.user.user_metadata?.birthdate), is_primary: true }
    let athleteId = existing?.id
    if (athleteId) {
      const { error } = await supabaseAdmin.from('athlete_profiles').update(athleteValues).eq('id', athleteId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { data, error } = await supabaseAdmin.from('athlete_profiles').insert(athleteValues).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      athleteId = data.id
    }
    const contactName = clean(answers.contactName)
    if (contactName && athleteId) {
      const { data: existingContact } = await supabaseAdmin.from('emergency_contacts').select('id').eq('athlete_id', athleteId).limit(1).maybeSingle()
      const contact = { athlete_id: athleteId, name: contactName, relationship: clean(answers.contactRel), phone: clean(answers.contactPhone) }
      if (existingContact?.id) await supabaseAdmin.from('emergency_contacts').update(contact).eq('id', existingContact.id)
      else await supabaseAdmin.from('emergency_contacts').insert(contact)
    }
    if (referralSource) await supabaseAdmin.from('profiles').update({ referral_source: referralSource }).eq('id', session.user.id)
  }
  return NextResponse.json({ saved: true, completed: true, role: context.role })
}
