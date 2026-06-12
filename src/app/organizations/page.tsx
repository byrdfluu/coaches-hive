import Link from 'next/link'

const adminFeatures = [
  {
    title: 'Multi-coach coordination',
    body: 'Each coach gets their own login and team view. You see everything — all teams, all activity — from one dashboard.',
  },
  {
    title: 'Dues collection',
    body: 'Create fees, assign to teams or athletes, and let automated reminders handle the follow-up.',
  },
  {
    title: 'Roster management',
    body: 'Manage athletes across multiple teams, track compliance, and export when you need it.',
  },
  {
    title: 'Exportable reports',
    body: 'Share finance, roster, and activity reports in one click.',
  },
]

const snapshotRows = [
  ['Teams', '18'],
  ['Active coaches', '42'],
  ['Athletes', '620'],
  ['Monthly fees collected', '$78,400'],
]

const steps = [
  {
    title: 'Set up your program',
    detail: 'Add branding, create your teams, and configure compliance settings in minutes.',
  },
  {
    title: 'Invite coaches and athletes',
    detail: 'Assign roles, import rosters, and connect coaches to their teams.',
  },
  {
    title: 'Collect dues and run reports',
    detail: 'Create fees, automate reminders, and export reports whenever you need them.',
  },
]

const faqs = [
  {
    q: 'How does org pricing work?',
    a: 'Plans start at $299/mo (Standard), $599/mo (Growth), and $1,199/mo (Enterprise). Each plan includes a 14-day free trial. Session and marketplace fees vary by tier. See full details on the pricing page.',
  },
  {
    q: 'Can we invite multiple teams and staff at once?',
    a: 'Yes. You can invite staff, assign roles, and import teams in bulk from the org portal.',
  },
  {
    q: 'Can we bulk upload coaches, athletes, and performance data from another system?',
    a: 'Yes. The org portal supports CSV imports for coaches (name, email, sport, team, role) and athletes (name, email, sport, grad year, position). You can also import athlete performance metrics in bulk — sprint times, height, weight, or any custom metric — using a simple CSV with athlete email, metric name, value, and date. Existing platform users are linked automatically; new users receive an invite email.',
  },
  {
    q: 'What reports can we export?',
    a: 'Billing, roster, compliance, and activity reports can be exported as CSV for finance and leadership.',
  },
  {
    q: 'Do you support automated fee reminders?',
    a: 'Yes. Schedule reminders by due date and track who has paid from the org dashboard.',
  },
  {
    q: 'How long does onboarding take?',
    a: 'Most orgs complete setup in under a day, including branding, roster imports, and fee setup.',
  },
]

export default function OrganizationsPage() {
  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <header className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <p className="public-kicker">For organizations</p>
            <h1 className="display text-4xl font-semibold leading-[1.06] text-[#191919] md:text-5xl">
              One platform to run your entire youth sports program.
            </h1>
            <p className="max-w-2xl text-base text-[#4a4a4a] md:text-lg">
              Tryout management, multi-coach coordination, roster control, and dues collection — built for the director running it all.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup?role=org" className="accent-button px-6 py-3">
                Start free trial
              </Link>
              <Link
                href="/pricing?tab=organizations"
                className="inline-flex items-center justify-center rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f7f6f4]"
              >
                See pricing
              </Link>
            </div>
          </div>
          <div className="glass-card card-hero card-accent border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
              Org snapshot
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
              Northside Athletics
            </h2>
            <p className="mt-1 text-sm text-[#4a4a4a]">Season overview</p>
            <div className="mt-4 grid gap-3 text-xs text-[#4a4a4a]">
              {snapshotRows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                >
                  <span>{label}</span>
                  <span className="font-semibold text-[#191919]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className="mt-12">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Org admin controls</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
              Everything your operations team needs.
            </h2>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {adminFeatures.map((item) => (
              <div key={item.title} className="glass-card border border-[#191919] bg-white p-5">
                <h3 className="text-lg font-semibold text-[#191919]">{item.title}</h3>
                <p className="mt-3 text-sm text-[#4a4a4a]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Operations view</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Track teams and staff in one view.</h2>
            <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                Program calendars, compliance notes, and team rosters in one dashboard.
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                Role-based permissions for org admins, team managers, and coaches.
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                Shared messaging for families, staff, and leadership.
              </div>
            </div>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Billing cadence</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Collect dues without manual follow-ups.</h2>
            <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
              <div className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <span>Fall season fee</span>
                <span className="font-semibold text-[#191919]">84% paid</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <span>Reminder schedule</span>
                <span className="font-semibold text-[#191919]">Weekly</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <span>Export next report</span>
                <span className="font-semibold text-[#191919]">Friday</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Public presence</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
              Give athletes and families a clear org home.
            </h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Share schedules, program notes, and updates on branded public pages without
              exposing internal admin tools.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-[#191919]">
              <span className="rounded-full border border-[#191919] px-3 py-1">Org branding</span>
              <span className="rounded-full border border-[#191919] px-3 py-1">Season highlights</span>
              <span className="rounded-full border border-[#191919] px-3 py-1">Team contacts</span>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Launch steps</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  Get your program live in three steps.
                </h2>
              </div>
              <Link href="/signup?role=org" className="accent-button px-6 py-3">
                Start setup
              </Link>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
              {steps.map((step, idx) => (
                <div key={step.title} className="rounded-2xl border border-[#191919] bg-[#f5f5f5] p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] bg-white text-sm font-semibold text-[#191919]">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-[#191919]">{step.title}</p>
                      <p className="text-sm text-[#4a4a4a]">{step.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">FAQs</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Organization questions</h2>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {faqs.map((item) => (
              <details key={item.q} className="glass-card border border-[#191919] bg-white p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold text-[#191919]">
                  <span>{item.q}</span>
                  <span className="text-[#b80f0a]">▾</span>
                </summary>
                <p className="mt-3 text-sm text-[#4a4a4a]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-3xl border border-[#191919] bg-white/80 p-6 text-center shadow-sm">
          <h3 className="text-2xl font-semibold text-[#191919]">Ready to centralize your program?</h3>
          <p className="mt-2 text-sm text-[#4a4a4a]">Talk to sales or review org pricing in minutes.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/contact#org-demo" className="accent-button px-6 py-3">
              Talk to sales
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f7f6f4]"
            >
              Review pricing
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
