import Link from 'next/link'
import { redirect } from 'next/navigation'

const orgPlans = [
  { key: 'growing_organization', name: 'Growing Organization', teams: '2–6 active teams', staff: 'Up to 15 coaches and staff', monthly: 129, popular: true },
  { key: 'established_organization', name: 'Established Organization', teams: '7–15 active teams', staff: 'Up to 35 coaches and staff', monthly: 249, popular: false },
  { key: 'league_enterprise', name: 'League & Enterprise', teams: '16+ active teams', staff: 'Flexible staff limits', monthly: 499, popular: false, custom: true },
] as const

export default async function SelectPlanPage({ searchParams }: { searchParams: Promise<{ role?: string; billing_interval?: string }> }) {
  const params = await searchParams
  const role = String(params.role || '')
  const interval = params.billing_interval === 'year' ? 'year' : 'month'
  if (role === 'athlete') redirect('/athlete/onboarding')
  if (role === 'coach') redirect(`/checkout?role=coach&tier=team_starter&billing_interval=${interval}&from=select-plan`)

  return <main className="page-shell min-h-screen"><div className="relative z-10 mx-auto max-w-5xl px-5 py-12 text-left sm:px-6">
    <header className="max-w-2xl"><p className="public-kicker">Organization plans</p><h1 className="mt-3 text-4xl font-semibold text-[#191919]">Choose the plan that fits your organization</h1><p className="mt-3 text-[#4a4a4a]">Choose by the number of active teams you manage. You can upgrade later without moving your records.</p>
      <div className="mt-6 inline-flex rounded-full border border-[#191919] bg-white p-1"><Link href="/select-plan?role=org_admin&billing_interval=month" className={`rounded-full px-4 py-2 text-sm font-semibold ${interval === 'month' ? 'bg-[#191919] text-white' : 'text-[#191919]'}`}>Monthly</Link><Link href="/select-plan?role=org_admin&billing_interval=year" className={`rounded-full px-4 py-2 text-sm font-semibold ${interval === 'year' ? 'bg-[#191919] text-white' : 'text-[#191919]'}`}>Annual — Save 2 months</Link></div>
    </header>
    <section className="mt-10 grid gap-5 lg:grid-cols-3">{orgPlans.map((plan) => { const price = interval === 'year' ? plan.monthly * 10 : plan.monthly; return <article key={plan.key} className={`relative flex flex-col rounded-3xl bg-white p-6 text-left shadow-sm ${plan.popular ? 'border-2 border-[#b80f0a]' : 'border border-[#dcdcdc]'}`}>
      {plan.popular ? <span className="absolute right-5 top-0 -translate-y-1/2 rounded-full bg-[#b80f0a] px-3 py-1 text-xs font-semibold text-white">Most Popular</span> : null}<h2 className="text-2xl font-semibold text-[#191919]">{plan.name}</h2><p className="mt-4 text-3xl font-semibold text-[#191919]">{'custom' in plan ? 'Starting at ' : ''}${price.toLocaleString()}</p><p className="mt-1 text-sm text-[#4a4a4a]">{'custom' in plan ? 'or custom pricing' : `per ${interval === 'year' ? 'year' : 'month'}`}</p><div className="mt-6 space-y-2 text-sm text-[#191919]"><p>{plan.teams}</p><p>{plan.staff}</p></div><Link href={'custom' in plan ? '/contact?topic=enterprise' : `/checkout?role=org_admin&tier=${plan.key}&billing_interval=${interval}&from=select-plan`} className={`mt-8 inline-flex justify-center rounded-full px-5 py-3 text-sm font-semibold text-white ${plan.popular ? 'bg-[#b80f0a]' : 'bg-[#191919]'}`}>{'custom' in plan ? 'Contact Sales' : 'Start Free Trial'}</Link>
    </article> })}</section>
  </div></main>
}
