import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const requestedProfileId = new URL(request.url).searchParams.get('athlete_profile_id')
    || String(session.user.user_metadata?.selected_athlete_profile_id || '')
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, requestedProfileId)
  if (!athlete) return jsonError('Athlete profile not found or access denied.', 404)

  // Call the same authenticated visibility RPC used by iOS so RLS/auth.uid()
  // remains part of the authorization decision.
  const { data: programs, error: programsError } = await supabase.rpc('assigned_org_programs_for_athlete', {
    p_athlete_id: athlete.profileId,
  })
  if (programsError) return jsonError('Unable to load assigned programs.', 500)

  const programIds = (programs || []).map((program: { id: string }) => program.id)
  const [{ data: registrations }, { data: orgSettings }] = await Promise.all([
    programIds.length
      ? supabaseAdmin
          .from('program_registrations')
          .select('id,program_id,status,registered_at')
          .eq('athlete_profile_id', athlete.profileId)
          .in('program_id', programIds)
      : Promise.resolve({ data: [] }),
    programIds.length
      ? supabaseAdmin
          .from('org_settings')
          .select('org_id,org_name')
          .in('org_id', Array.from(new Set((programs || []).map((program: { org_id: string }) => program.org_id))))
      : Promise.resolve({ data: [] }),
  ])

  const registrationMap = new Map((registrations || []).map((registration) => [registration.program_id, registration]))
  const orgMap = new Map((orgSettings || []).map((org) => [org.org_id, org.org_name || 'Organization']))
  const rows = (programs || []).map((program: Record<string, unknown>) => ({
    ...program,
    organization_name: orgMap.get(String(program.org_id)) || 'Organization',
    price_cents: Math.round(Number(program.price || 0) * 100),
    registration: registrationMap.get(String(program.id)) || null,
  }))

  return NextResponse.json({ programs: rows, athlete_profile_id: athlete.profileId }, { headers: privateHeaders })
}

export async function POST(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const programId = String(body?.program_id || '').trim()
  const requestedProfileId = String(body?.athlete_profile_id || session.user.user_metadata?.selected_athlete_profile_id || '').trim()
  if (!programId) return jsonError('Program is required.')

  const athlete = await resolveAuthorizedAthleteContext(session.user.id, requestedProfileId)
  if (!athlete) return jsonError('Athlete profile not found or access denied.', 404)

  const [{ data: visible }, { data: program }, { count: occupiedCount }, { data: existing }] = await Promise.all([
    supabase.rpc('is_org_program_visible', {
      target_program_id: programId,
      target_athlete_id: athlete.profileId,
    }),
    supabaseAdmin.from('programs').select('id,price,capacity,status').eq('id', programId).maybeSingle(),
    supabaseAdmin.from('program_registrations').select('id', { count: 'exact', head: true }).eq('program_id', programId).in('status', ['pending', 'paid']),
    supabaseAdmin.from('program_registrations').select('id,status,registered_at').eq('program_id', programId).eq('athlete_profile_id', athlete.profileId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (visible !== true || !program || program.status !== 'active') return jsonError('Program is unavailable.', 404)
  if (existing?.status === 'paid') return NextResponse.json({ registration: existing, checkout_required: false })
  const capacity = Number(program.capacity || 0)
  if (!existing && capacity > 0 && (occupiedCount || 0) >= capacity) return jsonError('Program is full.', 409)

  const priceCents = Math.round(Number(program.price || 0) * 100)
  const status = priceCents > 0 ? 'pending' : 'paid'
  const payload = {
    program_id: programId,
    athlete_profile_id: athlete.profileId,
    owner_user_id: session.user.id,
    status,
    ...(status === 'paid' ? { registered_at: new Date().toISOString() } : {}),
  }
  const registrationResult = existing
    ? await supabaseAdmin.from('program_registrations').update(payload).eq('id', existing.id).select('id,status,registered_at').single()
    : await supabaseAdmin.from('program_registrations').insert(payload).select('id,status,registered_at').single()
  if (registrationResult.error || !registrationResult.data) return jsonError('Unable to register for this program.', 500)

  return NextResponse.json({
    registration: registrationResult.data,
    checkout_required: priceCents > 0,
  }, { status: existing ? 200 : 201, headers: privateHeaders })
}
