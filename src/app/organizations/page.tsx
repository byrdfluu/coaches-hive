import Link from 'next/link'
import RelationshipDiagram from '@/components/RelationshipDiagram'
import PublicFooter from '@/components/PublicFooter'

const barlow = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }

const SNAPSHOT = [
  { label: 'Teams', value: '18' },
  { label: 'Active Coaches', value: '42' },
  { label: 'Athletes', value: '620' },
  { label: 'Monthly Fees Collected', value: '$78,400' },
]

const FEATURES = [
  'Tryout management',
  'Multi-coach coordination with role-based access',
  'Dues collection with automated reminders',
  'Roster management across all teams',
  'Exportable reports for finance and compliance',
  'Branded public page for schedules and team contacts',
]

const STEPS = [
  'Set up your program — add teams, configure settings, and upload your branding.',
  'Invite coaches and import your rosters.',
  'Collect dues and run reports.',
]

export default function OrganizationsPage() {
  return (
    <main className="public-page">

      {/* ── Section 1: What it looks like ── */}
      <section className="bg-[#191919] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#B80F0A]" style={barlow}>
            For programs
          </p>
          <div className="mt-6 grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h1 className="text-5xl font-semibold leading-none text-[#E8E8E8] sm:text-6xl lg:text-[4.5rem]">
                One platform to run your entire youth sports program.
              </h1>
              <p className="mt-6 text-base leading-relaxed text-[#6b6b6b] sm:text-lg">
                Your entire program — schedules, rosters, payments, and coaches — managed from one dashboard.
              </p>
            </div>

            {/* Org Dashboard Mock */}
            <div className="rounded-2xl border border-[#2a2a2a] bg-[#111111] p-6">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#B80F0A]" style={barlow}>
                  Program snapshot
                </p>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#BCFF1F]" />
                  <span className="text-[10px] text-[#4a4a4a]" style={barlow}>Live</span>
                </span>
              </div>
              <div className="space-y-0 divide-y divide-[#1e1e1e]">
                {SNAPSHOT.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-3.5">
                    <span
                      className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#B80F0A]"
                      style={barlow}
                    >
                      {label}
                    </span>
                    <span className="text-xl font-semibold tabular-nums text-[#E8E8E8]">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-[#BCFF1F]" />
                <div className="h-1.5 w-1/4 rounded-full bg-[#2a2a2a]" />
              </div>
              <p className="mt-2 text-[10px] text-[#4a4a4a]" style={barlow}>78% of fees collected this cycle</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: What you get ── */}
      <section className="bg-[#E8E8E8] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#B80F0A]" style={barlow}>
            Features
          </p>
          <h2 className="mt-4 text-4xl font-semibold text-[#191919] sm:text-5xl">
            Everything your program needs.
          </h2>
          <ul className="mt-10 space-y-4">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-4">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#B80F0A]" />
                <span className="text-lg leading-snug text-[#191919]">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Section 3: How you connect ── */}
      <section className="bg-[#191919] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#B80F0A]" style={barlow}>
            How you connect
          </p>
          <h2 className="mt-4 max-w-2xl text-4xl font-semibold text-[#E8E8E8] sm:text-5xl">
            You set the program. Coaches run their teams. Athletes and parents stay informed.
          </h2>

          <div className="mt-14">
            <RelationshipDiagram activeNode="org" />
          </div>

          <div className="mt-14 grid gap-10 sm:grid-cols-2">
            <div>
              <h3
                className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#BCFF1F]"
                style={barlow}
              >
                With coaches
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[#6b6b6b]">
                Assign coaches to teams, set their permissions, and see all team activity from one dashboard. Coaches operate independently without needing you in every conversation.
              </p>
            </div>
            <div>
              <h3
                className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#BCFF1F]"
                style={barlow}
              >
                With athletes
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[#6b6b6b]">
                Athletes and parents get schedules, dues requests, and program updates through their own login. No group chats, no missed messages.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 4: How to sign up ── */}
      <section className="bg-[#E8E8E8] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#B80F0A]" style={barlow}>
            Get started
          </p>
          <h2 className="mt-4 text-4xl font-semibold text-[#191919] sm:text-5xl">
            Three steps to a running program.
          </h2>
          <ol className="mt-10 space-y-6">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#191919] text-sm font-bold text-[#191919]">
                  {i + 1}
                </span>
                <p className="pt-1 text-lg leading-snug text-[#191919]">{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-[#B80F0A] px-8 py-4 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />

    </main>
  )
}
