import Link from 'next/link'
import { redirect } from 'next/navigation'
import { launchSurface } from '@/lib/launchSurface'

const adminFeatures = [
  {
    title: 'Compliance-ready billing',
    body: 'Collect fees, track invoices, and stay audit ready with clear statuses.',
  },
  {
    title: 'Role-based access',
    body: 'Give admins, coaches, and staff the right access without extra tools.',
  },
  {
    title: 'Exportable reports',
    body: 'Share finance, roster, and activity reports in one click.',
  },
  {
    title: 'Automated fee reminders',
    body: 'Keep families on track with scheduled reminders and follow ups.',
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
    title: 'Set up org profile',
    detail: 'Add branding, season dates, and compliance preferences in minutes.',
  },
  {
    title: 'Invite staff and teams',
    detail: 'Assign roles, import rosters, and connect coaches to programs.',
  },
  {
    title: 'Launch billing + reporting',
    detail: 'Create fees, automate reminders, and export reports whenever needed.',
  },
]

const faqs = [
  {
    q: 'How does org pricing work?',
    a: 'Orgs pay a base monthly fee plus per-coach and per-athlete rates. Marketplace and session fees are shown in pricing.',
  },
  {
    q: 'Can we invite multiple teams and staff at once?',
    a: 'Yes. You can invite staff, assign roles, and import teams in bulk from the org portal.',
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
  if (!launchSurface.publicOrgEntryPointsEnabled) {
    redirect('/')
  }

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <header className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <p className="public-kicker">For organizations</p>
            <h1 className="display text-4xl font-semibold leading-[1.06] text-[#191919] md:text-5xl">
              Run teams, billing, and access in one platform.
            </h1>
            <p className="max-w-2xl text-base text-[#4a4a4a] md:text-lg">
              Centralize compliance-ready billing, role-based access, and reporting
              for every program you manage.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/contact#org-demo" className="accent-button px-6 py-3">
                Request a demo
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f7f6f4]"
              >
                See pricing
              </Link>
            </div>
            <p className="text-xs text-[#4a4a4a]">
              Already an org admin? Sign in to the portal from the header.
            </p>
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
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Collect fees without manual follow ups.</h2>
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
                  Get your org live in three steps.
                </h2>
              </div>
              <Link href="/signup" className="accent-button px-6 py-3">
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
          <h3 className="text-2xl font-semibold text-[#191919]">Ready to centralize your org?</h3>
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
