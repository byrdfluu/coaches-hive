import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { logAdminAction } from '@/lib/auditLog'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

export const dynamic = 'force-dynamic'

const rows = (result: { data?: any[] | null }) => result.data || []

const loadGovernanceSnapshot = async () => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [
    leaguesResult, assignmentsResult, leagueOrgsResult, leagueMembersResult,
    registrationsResult, feesResult, documentsResult, seasonsResult,
    slackResult, pushResult, profilesResult, organizationsResult,
    coachProfilesResult, athletesResult, guardianInvitesResult, leagueAccessResult,
  ] = await Promise.all([
    supabaseAdmin.from('leagues').select('id,name,sport,general_location,status,max_teams,billing_model,created_at').order('created_at', { ascending: false }).limit(5000),
    supabaseAdmin.from('league_team_assignments').select('league_id,team_id,status').limit(10000),
    supabaseAdmin.from('league_organizations').select('league_id,status').limit(10000),
    supabaseAdmin.from('league_memberships').select('league_id,status').limit(10000),
    supabaseAdmin.from('league_registrations').select('league_id,status').limit(10000),
    supabaseAdmin.from('league_fee_assignments').select('league_id,status,amount_cents,paid_cents').limit(10000),
    supabaseAdmin.from('league_document_submissions').select('league_id,status').limit(10000),
    supabaseAdmin.from('league_seasons').select('league_id,name,is_active').limit(5000),
    supabaseAdmin.from('slack_event_outbox').select('status,sent_at').limit(10000),
    supabaseAdmin.from('push_notification_deliveries').select('status,created_at').gte('created_at', since24h).limit(10000),
    supabaseAdmin.from('profiles').select('id,is_test,status').limit(10000),
    supabaseAdmin.from('organizations').select('id,is_test,status').limit(10000),
    supabaseAdmin.from('independent_coach_profiles').select('coach_id,is_active').limit(10000),
    supabaseAdmin.from('athlete_profiles').select('birthdate,coppa_consent_given').limit(10000),
    supabaseAdmin.from('athlete_guardian_invitations').select('status').limit(10000),
    supabaseAdmin.from('league_access_invitations').select('status').limit(10000),
  ])

  const requiredResults = [leaguesResult, assignmentsResult, leagueOrgsResult, leagueMembersResult, registrationsResult, feesResult, documentsResult, seasonsResult]
  const requiredError = requiredResults.find(result => result.error)?.error
  if (requiredError) throw requiredError

  const assignments = rows(assignmentsResult)
  const leagueOrganizations = rows(leagueOrgsResult)
  const memberships = rows(leagueMembersResult)
  const registrations = rows(registrationsResult)
  const fees = rows(feesResult)
  const documents = rows(documentsResult)
  const seasons = rows(seasonsResult)
  const slack = rows(slackResult)
  const push = rows(pushResult)
  const profiles = rows(profilesResult)
  const organizations = rows(organizationsResult)
  const activeCoachIds = new Set(rows(coachProfilesResult).filter(row => row.is_active).map(row => row.coach_id))
  const thirteenYearsAgo = new Date()
  thirteenYearsAgo.setUTCFullYear(thirteenYearsAgo.getUTCFullYear() - 13)

  return {
    leagues: rows(leaguesResult).map(league => ({
      id: league.id,
      name: league.name,
      sport: league.sport,
      general_location: league.general_location,
      status: league.status,
      max_teams: league.max_teams,
      billing_model: league.billing_model,
      team_count: new Set(assignments.filter(row => row.league_id === league.id && row.status === 'active').map(row => row.team_id)).size,
      organization_count: leagueOrganizations.filter(row => row.league_id === league.id && row.status === 'active').length,
      administrator_count: memberships.filter(row => row.league_id === league.id && row.status === 'active').length,
      registration_count: registrations.filter(row => row.league_id === league.id && row.status !== 'withdrawn').length,
      outstanding_cents: fees.filter(row => row.league_id === league.id && ['unpaid', 'partial'].includes(row.status)).reduce((sum, row) => sum + Math.max(Number(row.amount_cents || 0) - Number(row.paid_cents || 0), 0), 0),
      missing_documents: documents.filter(row => row.league_id === league.id && ['rejected', 'expired'].includes(row.status)).length,
      active_season: seasons.find(row => row.league_id === league.id && row.is_active)?.name || null,
    })),
    slack_pending: slack.filter(row => row.status === 'pending').length,
    slack_failed: slack.filter(row => row.status === 'failed').length,
    slack_dead_letter: slack.filter(row => row.status === 'dead_letter').length,
    slack_sent_24h: slack.filter(row => row.status === 'sent' && row.sent_at && row.sent_at >= since24h).length,
    push_failed_24h: push.filter(row => row.status !== 'delivered').length,
    push_delivered_24h: push.filter(row => row.status === 'delivered').length,
    test_users: profiles.filter(row => row.is_test).length,
    test_organizations: organizations.filter(row => row.is_test).length,
    public_coaches: profiles.filter(row => activeCoachIds.has(row.id) && !row.is_test && (row.status || 'active') === 'active').length,
    public_organizations: organizations.filter(row => !row.is_test && row.status === 'active').length,
    minor_consent_attention: rows(athletesResult).filter(row => row.birthdate && new Date(row.birthdate) > thirteenYearsAgo && !row.coppa_consent_given).length,
    guardian_invites_pending: rows(guardianInvitesResult).filter(row => row.status === 'pending').length,
    league_access_pending: rows(leagueAccessResult).filter(row => ['pending', 'pending_approval'].includes(row.status)).length,
  }
}

export async function GET() {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const { data, error } = await supabaseAdmin.rpc('admin_governance_snapshot')
  if (!error && data) return NextResponse.json({ snapshot: data })
  try {
    const snapshot = await loadGovernanceSnapshot()
    return NextResponse.json({ snapshot, source: 'authoritative_tables' })
  } catch (fallbackError) {
    console.error('[admin/governance] snapshot unavailable', { rpcCode: error?.code, fallbackError })
    return NextResponse.json({ error: 'Unable to load platform governance. Please retry.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireSuperadminApi(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => null)
  if (body?.action !== 'retry_slack_events' || body?.confirmed !== true) {
    return NextResponse.json({ error: 'Confirm the Slack retry before continuing.' }, { status: 400 })
  }
  // This RPC authorizes with auth.uid(), so it must run as the authenticated
  // superadmin rather than through the service-role client.
  const supabase = await createRouteHandlerClientCompat()
  const { data, error } = await supabase.rpc('admin_retry_slack_events')
  if (error) {
    console.error('[admin/governance] Slack retry failed', {
      provider_code: error.code,
      provider_message: error.message,
      provider_details: error.details,
      provider_hint: error.hint,
      actor_id: auth.user.id,
    })
    return NextResponse.json({ error: 'Slack retry could not be started. Please retry.' }, { status: 500 })
  }
  await logAdminAction({ action: 'admin.slack_events.retry', actorId: auth.user.id, actorEmail: auth.user.email || null, targetType: 'slack_event_outbox', targetId: null, metadata: { confirmed: true, result: data } })
  return NextResponse.json({ result: data })
}
