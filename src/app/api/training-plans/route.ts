import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAuthorizedCoachAthleteProfileIds } from '@/lib/authorizedCoachAthletes'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'

export const dynamic = 'force-dynamic'

type PlanRow = {
  id: string
  coach_id: string
  athlete_id: string
  title: string
  description: string | null
  content: string | null
  status: string
  created_at: string
}

async function decorate(plans: PlanRow[]) {
  const athleteIds = Array.from(new Set(plans.map((p) => p.athlete_id)))
  const coachIds = Array.from(new Set(plans.map((p) => p.coach_id)))
  const planIds = plans.map((p) => p.id)
  const [{ data: athletes }, { data: coaches }, { data: progress }] = await Promise.all([
    athleteIds.length ? supabaseAdmin.from('athlete_profiles').select('id,full_name').in('id', athleteIds) : Promise.resolve({ data: [] }),
    coachIds.length ? supabaseAdmin.from('profiles').select('id,full_name').in('id', coachIds) : Promise.resolve({ data: [] }),
    planIds.length ? supabaseAdmin.from('coach_training_plan_progress').select('plan_id,athlete_id,status,completed_at').in('plan_id', planIds) : Promise.resolve({ data: [] }),
  ])
  const athleteNames = new Map((athletes || []).map((row) => [row.id, row.full_name || 'Athlete']))
  const coachNames = new Map((coaches || []).map((row) => [row.id, row.full_name || 'Coach']))
  const progressByPlan = new Map((progress || []).map((row) => [row.plan_id, row]))
  return plans.map((plan) => ({
    ...plan,
    athlete_name: athleteNames.get(plan.athlete_id) || 'Athlete',
    coach_name: coachNames.get(plan.coach_id) || 'Coach',
    progress: progressByPlan.get(plan.id)?.status || 'not_started',
    completed_at: progressByPlan.get(plan.id)?.completed_at || null,
  }))
}

export async function GET(request: Request) {
  const { session, role, error } = await getSessionRole(['coach', 'athlete'])
  if (error || !session) return error
  let query = supabaseAdmin.from('coach_training_plans').select('*').order('created_at', { ascending: false })
  if (role === 'coach') {
    const athleteProfileIds = await resolveAuthorizedCoachAthleteProfileIds(session.user.id)
    if (!athleteProfileIds.length) return NextResponse.json({ plans: [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
    query = query.eq('coach_id', session.user.id).in('athlete_id', athleteProfileIds)
  }
  else {
    const requestedProfileId = new URL(request.url).searchParams.get('athlete_profile_id')
      || String(session.user.user_metadata?.selected_athlete_profile_id || '')
    const athlete = await resolveAuthorizedAthleteContext(session.user.id, requestedProfileId)
    if (!athlete) return NextResponse.json({ plans: [], athlete_profile_id: null })
    query = query.eq('athlete_id', athlete.profileId)
  }
  const { data, error: queryError } = await query
  if (queryError) return jsonError(queryError.message, 500)
  return NextResponse.json({ plans: await decorate((data || []) as PlanRow[]) })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  const athleteId = String(body.athlete_id || '')
  if (!title || !athleteId) return jsonError('title and athlete_id are required')
  const athleteProfileIds = await resolveAuthorizedCoachAthleteProfileIds(session.user.id)
  if (!athleteProfileIds.includes(athleteId)) return jsonError('Athlete is not available in the selected workspace', 403)
  const { data, error: insertError } = await supabaseAdmin.from('coach_training_plans').insert({
    coach_id: session.user.id,
    athlete_id: athleteId,
    title,
    description: String(body.description || '').trim() || null,
    content: String(body.content || '').trim() || null,
  }).select('*').single()
  if (insertError) return jsonError(insertError.message, 500)
  return NextResponse.json({ plan: (await decorate([data as PlanRow]))[0] }, { status: 201 })
}

export async function PATCH(request: Request) {
  const { session, role, error } = await getSessionRole(['coach', 'athlete'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return jsonError('id is required')
  if (role === 'athlete') {
    const status = String(body.progress || '')
    if (!['not_started', 'in_progress', 'completed'].includes(status)) return jsonError('Invalid progress status')
    const athlete = await resolveAuthorizedAthleteContext(session.user.id, String(body.athlete_profile_id || session.user.user_metadata?.selected_athlete_profile_id || ''))
    if (!athlete) return jsonError('Athlete profile not found', 404)
    const { data: plan } = await supabaseAdmin.from('coach_training_plans').select('id').eq('id', id).eq('athlete_id', athlete.profileId).maybeSingle()
    if (!plan) return jsonError('Plan not found', 404)
    const { error: upsertError } = await supabaseAdmin.from('coach_training_plan_progress').upsert({
      plan_id: id,
      athlete_id: athlete.profileId,
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'plan_id,athlete_id' })
    if (upsertError) return jsonError(upsertError.message, 500)
    return NextResponse.json({ ok: true })
  }
  const allowedAthleteIds = await resolveAuthorizedCoachAthleteProfileIds(session.user.id)
  const { data: existingPlan } = await supabaseAdmin.from('coach_training_plans')
    .select('id,athlete_id').eq('id', id).eq('coach_id', session.user.id).maybeSingle()
  if (!existingPlan || !allowedAthleteIds.includes(existingPlan.athlete_id)) return jsonError('Plan not found in the selected workspace', 404)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of ['title', 'description', 'content', 'status']) if (body[field] !== undefined) updates[field] = body[field]
  const { data, error: updateError } = await supabaseAdmin.from('coach_training_plans').update(updates).eq('id', id).eq('coach_id', session.user.id).select('*').maybeSingle()
  if (updateError) return jsonError(updateError.message, 500)
  if (!data) return jsonError('Plan not found', 404)
  return NextResponse.json({ plan: (await decorate([data as PlanRow]))[0] })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return jsonError('id is required')
  const allowedAthleteIds = await resolveAuthorizedCoachAthleteProfileIds(session.user.id)
  const { data: existingPlan } = await supabaseAdmin.from('coach_training_plans')
    .select('id,athlete_id').eq('id', id).eq('coach_id', session.user.id).maybeSingle()
  if (!existingPlan || !allowedAthleteIds.includes(existingPlan.athlete_id)) return jsonError('Plan not found in the selected workspace', 404)
  const { error: deleteError } = await supabaseAdmin.from('coach_training_plans').delete().eq('id', id).eq('coach_id', session.user.id)
  if (deleteError) return jsonError(deleteError.message, 500)
  return NextResponse.json({ ok: true })
}
