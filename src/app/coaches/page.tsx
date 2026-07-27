import type { Metadata } from 'next'
import GetTheAppButton from '@/components/GetTheAppButton'
import RelationshipDiagram from '@/components/RelationshipDiagram'

export const metadata: Metadata = {
  title: 'Coaching Software for Youth Sports Coaches',
  description: 'Manage scheduling, athletes, payments, messaging, and training from one coaching platform.',
  alternates: { canonical: '/coaches' },
}

const barlow = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }

const FEATURES = [
  'Bookings with real-time availability',
  'Payments and payouts per session',
  'Session programs — 1:1, group, and digital',
  'Automated reminders so athletes show up',
  'Progress check-ins after each session',
  'Verified reviews that build your reputation',
]

const STEPS = [
  'Create your profile — add your sport, experience, and rates.',
  'Set your availability and add your session offerings.',
  'Start accepting bookings.',
]

export default function CoachesPage() {
  return (
    <main className="public-page">

      {/* ── Section 1: What it looks like ── */}
      <section className="bg-[#191919] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#B80F0A]" style={barlow}>
            For coaches
          </p>
          <div className="mt-6 grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h1 className="text-5xl font-semibold leading-none text-[#E8E8E8] sm:text-6xl lg:text-[4.5rem]">
                Built for coaches who train youth athletes.
              </h1>
              <p className="mt-6 text-base leading-relaxed text-[#6b6b6b] sm:text-lg">
                Your coaching business, running the way your athletes experience you — sharp, organized, and professional.
              </p>
            </div>

            {/* Coach Profile Card Mock */}
            <div className="rounded-2xl border border-[#E0E0E0] bg-[#E8E8E8] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#191919] text-lg font-bold text-[#E8E8E8]">
                  JD
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-[#191919]">Jordan Davis</p>
                  <p className="text-sm text-[#4a4a4a]">Basketball · 8 years experience</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm font-bold text-[#B80F0A]">4.9★</span>
                    <span className="rounded-full border border-[#B80F0A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#B80F0A]" style={barlow}>
                      Verified
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-2.5 divide-y divide-[#D0D0D0]">
                {[
                  { label: 'Avg response time', value: '< 2 hours' },
                  { label: 'Next available', value: 'Tomorrow, 9 AM' },
                  { label: 'Format', value: 'Remote + In-person' },
                  { label: 'Rate', value: '$85 / session' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between pt-2.5">
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a4a4a]"
                      style={barlow}
                    >
                      {label}
                    </span>
                    <span className="text-sm font-semibold text-[#191919]">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <div className="rounded-full bg-[#191919] px-4 py-2.5 text-center text-sm font-semibold text-white">
                  Book a session
                </div>
              </div>
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
            Everything you need to run your sessions.
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
            You're the operator. Your org sets the context. Your athletes feel the difference.
          </h2>

          <div className="mt-14">
            <RelationshipDiagram activeNode="coach" />
          </div>

          <div className="mt-14 grid gap-10 sm:grid-cols-2">
            <div>
              <h3
                className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#BCFF1F]"
                style={barlow}
              >
                With your org
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[#6b6b6b]">
                If you're part of a youth sports org on Coaches Hive, your org admin can see your team activity, assign you to rosters, and coordinate dues — without disrupting how you run your sessions.
              </p>
            </div>
            <div>
              <h3
                className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#BCFF1F]"
                style={barlow}
              >
                With your athletes
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[#6b6b6b]">
                Athletes book directly through your profile, receive automatic reminders, track their progress, and leave verified reviews after each session.
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
            Three steps to your first booking.
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
            <GetTheAppButton
              label="Create coach profile"
              className="border-[#B80F0A] !bg-[#B80F0A] px-8 py-4 !text-white hover:opacity-90"
            />
          </div>
        </div>
      </section>

    </main>
  )
}
