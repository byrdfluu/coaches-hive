import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import LeagueNav from '@/components/LeagueNav'

export const dynamic = 'force-dynamic'

const sections = ['Clubs','Divisions','Teams','Schedule & standings','Registrations','Payments & balances','Documents & compliance','Announcements','Staff & permissions','Reports']

export default async function LeagueDashboardPage() {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) redirect('/login?next=/league')
  const { data: memberships } = await supabaseAdmin.from('league_memberships').select('id,league_id,role,status')
    .eq('user_id', session.user.id).eq('status', 'active')
  if (!memberships?.length) return <main className="page-shell min-h-screen"><div className="relative z-10 mx-auto max-w-4xl px-5 py-12"><h1 className="text-3xl font-semibold">League access unavailable</h1><p className="mt-3 text-[#4a4a4a]">Your account is not currently assigned to an active league. Ask a league administrator to review your invitation or access.</p><Link href="/" className="mt-6 inline-flex rounded-full bg-[#191919] px-5 py-3 font-semibold text-white">Return home</Link></div></main>
  const preferredId = String(session.user.user_metadata?.current_league_id || '')
  const membership = memberships.find((item) => item.league_id === preferredId) || memberships[0]
  const leagueId = membership.league_id
  const [leagueResult, clubsResult, teamsResult, seasonsResult, divisionsResult, gamesResult, registrationsResult, feesResult, documentsResult] = await Promise.all([
    supabaseAdmin.from('leagues').select('name,sport,general_location,max_teams,billing_model').eq('id', leagueId).maybeSingle(),
    supabaseAdmin.from('league_organizations').select('id', { count: 'exact', head: true }).eq('league_id', leagueId).eq('status', 'active'),
    supabaseAdmin.from('league_team_assignments').select('id', { count: 'exact', head: true }).eq('league_id', leagueId).eq('status', 'active'),
    supabaseAdmin.from('league_seasons').select('id,name,start_date,end_date,registration_status').eq('league_id', leagueId).order('start_date', { ascending: false }).limit(5),
    supabaseAdmin.from('league_divisions').select('id,name,age_group,competition_level').eq('league_id', leagueId).limit(12),
    supabaseAdmin.from('league_games').select('id,starts_at,location,status,home_score,away_score').eq('league_id', leagueId).order('starts_at').limit(8),
    supabaseAdmin.from('league_registrations').select('id', { count: 'exact', head: true }).eq('league_id', leagueId),
    supabaseAdmin.from('league_fee_assignments').select('amount_cents,status').eq('league_id', leagueId),
    supabaseAdmin.from('league_document_submissions').select('id,status').eq('league_id', leagueId),
  ])
  const league = leagueResult.data
  if (!league) return <main className="page-shell min-h-screen"><div className="relative z-10 mx-auto max-w-4xl px-5 py-12"><h1 className="text-3xl font-semibold">League unavailable</h1><p className="mt-3 text-[#4a4a4a]">This league is unavailable or your access has changed.</p></div></main>
  const fees = feesResult.data || []
  const assignedCents = fees.reduce((sum, item) => sum + Number(item.amount_cents || 0), 0)
  const outstandingCents = fees.filter((item) => !['paid','waived'].includes(String(item.status))).reduce((sum, item) => sum + Number(item.amount_cents || 0), 0)
  const missingDocs = (documentsResult.data || []).filter((item) => !['approved','complete'].includes(String(item.status))).length
  const cards = [
    ['Active clubs', clubsResult.count || 0, '#clubs'], ['Active teams', `${teamsResult.count || 0} / ${league.max_teams}`, '#teams'],
    ['Registrations', registrationsResult.count || 0, '#registrations'], ['Outstanding', `$${(outstandingCents / 100).toLocaleString()}`, '#payments'],
    ['Assigned fees', `$${(assignedCents / 100).toLocaleString()}`, '#payments'], ['Documents needing attention', missingDocs, '#documents'],
  ] as const
  return <main className="page-shell min-h-screen"><div className="relative z-10 mx-auto max-w-7xl px-5 py-10 sm:px-6"><div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><LeagueNav/><div>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="public-kicker">League Director Portal</p><h1 className="mt-2 text-4xl font-semibold text-[#191919]">{league.name}</h1><p className="mt-2 text-sm text-[#4a4a4a]">{[league.sport,league.general_location,membership.role?.replaceAll('_',' ')].filter(Boolean).join(' · ')}</p></div><Link href="/api/roles/available" className="rounded-full border border-[#191919] bg-white px-4 py-2 text-sm font-semibold">Switch workspace</Link></header>
    <nav className="mt-7 flex gap-2 overflow-x-auto pb-2">{sections.map((item) => <a key={item} href={`#${item.toLowerCase().split(' ')[0].replace('&','')}`} className="whitespace-nowrap rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm font-semibold">{item}</a>)}</nav>
    <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label,value,href]) => <a href={href} key={label} className="rounded-2xl border border-[#dcdcdc] bg-white p-5"><p className="text-sm text-[#4a4a4a]">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></a>)}</section>
    <div className="mt-8 grid gap-6 lg:grid-cols-2"><section id="divisions" className="rounded-3xl border border-[#dcdcdc] bg-white p-6"><h2 className="text-xl font-semibold">Divisions</h2><div className="mt-4 space-y-3">{divisionsResult.data?.length ? divisionsResult.data.map((division) => <div key={division.id} className="rounded-xl bg-[#f7f6f4] p-4"><p className="font-semibold">{division.name}</p><p className="text-sm text-[#4a4a4a]">{[division.age_group,division.competition_level].filter(Boolean).join(' · ') || 'Division details pending'}</p></div>) : <p className="text-sm text-[#4a4a4a]">No divisions have been created.</p>}</div></section>
      <section id="schedule" className="rounded-3xl border border-[#dcdcdc] bg-white p-6"><h2 className="text-xl font-semibold">Upcoming games</h2><div className="mt-4 space-y-3">{gamesResult.data?.length ? gamesResult.data.map((game) => <div key={game.id} className="rounded-xl bg-[#f7f6f4] p-4"><p className="font-semibold">{new Date(game.starts_at).toLocaleString()}</p><p className="text-sm text-[#4a4a4a]">{game.location || 'Location pending'} · {game.status}</p></div>) : <p className="text-sm text-[#4a4a4a]">No games are currently scheduled.</p>}</div></section>
      <section id="seasons" className="rounded-3xl border border-[#dcdcdc] bg-white p-6"><h2 className="text-xl font-semibold">Seasons</h2>{seasonsResult.data?.map((season) => <div key={season.id} className="mt-3 rounded-xl bg-[#f7f6f4] p-4"><p className="font-semibold">{season.name}</p><p className="text-sm text-[#4a4a4a]">Registration: {season.registration_status}</p></div>)}</section>
      <section id="documents" className="rounded-3xl border border-[#dcdcdc] bg-white p-6"><h2 className="text-xl font-semibold">Compliance</h2><p className="mt-3 text-3xl font-semibold">{missingDocs}</p><p className="text-sm text-[#4a4a4a]">document submissions need attention</p></section>
    </div>
  </div></div></div></main>
}
