import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type ParticipationScope = {
  leagueIds: string[]
  signerCapacity: 'athlete_or_guardian' | 'coach' | 'organization_representative' | 'league_representative'
  targetTypes: string[]
}

const resolveParticipationScope = async (userId: string, role: string): Promise<ParticipationScope> => {
  let leagueIds: string[] = []
  let signerCapacity: ParticipationScope['signerCapacity'] = 'athlete_or_guardian'
  let targetTypes = ['athlete']

  if (['league_admin', 'division_admin', 'finance_manager', 'registrar', 'compliance_manager', 'read_only_auditor', 'owner'].includes(role)) {
    signerCapacity = 'league_representative'
    targetTypes = ['organization', 'coach', 'team', 'athlete']
    const { data } = await supabaseAdmin.from('league_memberships').select('league_id').eq('user_id', userId).eq('status', 'active')
    leagueIds = (data ?? []).map((row) => row.league_id)
  } else if (['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'team_manager'].includes(role)) {
    signerCapacity = 'organization_representative'
    targetTypes = ['organization', 'team']
    const { data: members } = await supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', userId).eq('status', 'active')
    const orgIds = (members ?? []).map((row) => row.org_id)
    if (orgIds.length) {
      const { data } = await supabaseAdmin.from('league_organizations').select('league_id').in('org_id', orgIds).eq('status', 'active')
      leagueIds = (data ?? []).map((row) => row.league_id)
    }
  } else if (role === 'coach') {
    signerCapacity = 'coach'
    targetTypes = ['coach', 'team']
    const [{ data: owned }, { data: assigned }] = await Promise.all([
      supabaseAdmin.from('org_teams').select('id').eq('coach_id', userId),
      supabaseAdmin.from('org_team_coaches').select('team_id').eq('coach_id', userId),
    ])
    const teamIds = Array.from(new Set([...(owned ?? []).map((row) => row.id), ...(assigned ?? []).map((row) => row.team_id)]))
    if (teamIds.length) {
      const { data } = await supabaseAdmin.from('league_team_assignments').select('league_id').in('team_id', teamIds).eq('status', 'active')
      leagueIds = (data ?? []).map((row) => row.league_id)
    }
  } else {
    const [{ data: owned }, { data: family }, { data: consented }] = await Promise.all([
      supabaseAdmin.from('athlete_profiles').select('id').or(`owner_user_id.eq.${userId},auth_user_id.eq.${userId}`).eq('status', 'active'),
      supabaseAdmin.from('family_subscription_athletes').select('athlete_profile_id').eq('subscription_owner_id', userId),
      supabaseAdmin.from('guardian_privacy_consents').select('athlete_id').eq('guardian_user_id', userId)
        .eq('guardian_identity_confirmed', true).eq('coppa_consent_given', true),
    ])
    const athleteIds = Array.from(new Set([
      ...(owned ?? []).map((row) => row.id),
      ...(family ?? []).map((row) => row.athlete_profile_id),
      ...(consented ?? []).map((row) => row.athlete_id),
    ].filter(Boolean)))
    if (athleteIds.length) {
      const { data } = await supabaseAdmin.from('league_registrations').select('league_id').in('athlete_id', athleteIds).neq('status', 'withdrawn')
      leagueIds = (data ?? []).map((row) => row.league_id)
    }
  }

  return { leagueIds: Array.from(new Set(leagueIds)), signerCapacity, targetTypes }
}

const signedDocumentURL = async (storagePath: unknown) => {
  if (typeof storagePath !== 'string' || !storagePath.trim()) return null
  const { data, error } = await supabaseAdmin.storage.from('league-documents').createSignedUrl(storagePath, 300)
  return error ? null : data.signedUrl
}

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })

  const userId = session.user.id
  const role = String(session.user.user_metadata?.active_role || session.user.user_metadata?.role || '')
  const scope = await resolveParticipationScope(userId, role)
  if (!scope.leagueIds.length) return NextResponse.json({ leagues: [], signer_capacity: scope.signerCapacity })

  const [
    { data: leagues, error: leaguesError }, { data: seasons }, { data: announcements },
    { data: games }, { data: documents }, { data: profile },
  ] = await Promise.all([
    supabaseAdmin.from('leagues').select('id,name,sport,general_location').in('id', scope.leagueIds).eq('status', 'active'),
    supabaseAdmin.from('league_seasons').select('id,league_id,name,registration_status').in('league_id', scope.leagueIds).eq('is_active', true),
    supabaseAdmin.from('league_announcements').select('id,league_id,title,body,published_at').in('league_id', scope.leagueIds).order('published_at', { ascending: false }).limit(50),
    supabaseAdmin.from('league_games').select('id,league_id,starts_at,location,status,home_score,away_score').in('league_id', scope.leagueIds).order('starts_at').limit(100),
    supabaseAdmin.from('league_documents').select('id,league_id,title,document_type,target_type,due_at,is_required,storage_path').in('league_id', scope.leagueIds).in('target_type', scope.targetTypes).order('due_at'),
    supabaseAdmin.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
  ])
  if (leaguesError) {
    console.error('[league/participation] league query failed', leaguesError)
    return NextResponse.json({ error: 'League information is temporarily unavailable.' }, { status: 500 })
  }

  const documentIds = (documents ?? []).map((document) => document.id)
  const { data: signatures, error: signaturesError } = documentIds.length
    ? await supabaseAdmin.from('league_document_signatures').select('document_id,signer_name,signer_capacity,signed_at,signature_hash').eq('user_id', userId).in('document_id', documentIds)
    : { data: [], error: null }
  if (signaturesError) {
    console.error('[league/participation] signature query failed', signaturesError)
    return NextResponse.json({ error: 'League document signatures are temporarily unavailable.' }, { status: 500 })
  }

  const signatureByDocument = new Map((signatures ?? []).map((signature) => [signature.document_id, signature]))
  const hydratedDocuments = await Promise.all((documents ?? []).map(async (document) => ({
    ...document,
    signed_url: await signedDocumentURL(document.storage_path),
    signature: signatureByDocument.get(document.id) ?? null,
  })))

  return NextResponse.json({
    signer_capacity: scope.signerCapacity,
    default_signer_name: profile?.full_name ?? '',
    leagues: (leagues ?? []).map((league) => ({
      ...league,
      seasons: (seasons ?? []).filter((row) => row.league_id === league.id),
      announcements: (announcements ?? []).filter((row) => row.league_id === league.id),
      games: (games ?? []).filter((row) => row.league_id === league.id),
      documents: hydratedDocuments.filter((row) => row.league_id === league.id),
    })),
  })
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const documentId = typeof body?.document_id === 'string' ? body.document_id.trim() : ''
  const signerName = typeof body?.signer_name === 'string' ? body.signer_name.trim() : ''
  if (!documentId || signerName.length < 2 || body?.authority_attested !== true || body?.consent_attested !== true) {
    return NextResponse.json({ error: 'Full legal name and both signature attestations are required.' }, { status: 400 })
  }

  const role = String(session.user.user_metadata?.active_role || session.user.user_metadata?.role || '')
  const scope = await resolveParticipationScope(session.user.id, role)
  const { data: document, error: documentError } = await supabaseAdmin.from('league_documents')
    .select('id,league_id,target_type,storage_path').eq('id', documentId).maybeSingle()
  if (documentError) {
    console.error('[league/participation] document lookup failed', documentError)
    return NextResponse.json({ error: 'Unable to load the league document.' }, { status: 500 })
  }
  if (!document || !scope.leagueIds.includes(document.league_id) || !scope.targetTypes.includes(document.target_type)) {
    return NextResponse.json({ error: 'League document not found.' }, { status: 404 })
  }
  if (!document.storage_path) return NextResponse.json({ error: 'The document file must be uploaded before it can be signed.' }, { status: 409 })

  const { data: signatureId, error: signError } = await supabase.rpc('sign_league_document', {
    p_document_id: document.id,
    p_signer_name: signerName,
    p_signer_capacity: scope.signerCapacity,
    p_authority_attested: true,
    p_consent_attested: true,
    p_consent_version: 'league-electronic-signature-v1',
    p_client_platform: 'web',
    p_client_app_version: process.env.NEXT_PUBLIC_APP_VERSION || 'web',
  })
  if (signError) {
    console.error('[league/participation] document signature failed', signError)
    return NextResponse.json({ error: 'Unable to sign this league document.' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, signature_id: signatureId })
}
