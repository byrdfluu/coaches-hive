export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { launchSurface } from '@/lib/launchSurface'
import AthletePortalGate from '@/components/AthletePortalGate'
const athleteFaqs = [
  {
    q: 'How do I find and compare coaches?',
    a: 'Use Discover to filter by sport, pricing, availability, and reviews, then compare coach profiles before booking.',
  },
  {
    q: 'What happens after I book a session?',
    a: 'You receive a confirmation and reminders. Sessions appear in your calendar with easy reschedule options.',
  },
  {
    q: 'Can I message my coach and share files?',
    a: 'Yes. Messaging keeps your conversations and attachments in one place.',
  },
  {
    q: 'Can parents manage multiple athletes?',
    a: 'Yes. Family tiers support multiple athlete profiles, one dashboard, and a combined calendar.',
  },
  {
    q: 'How do refunds and cancellations work?',
    a: 'Manage cancellations from your bookings list. Refunds are handled according to platform policies.',
  },
  {
    q: 'Do coaches have reviews?',
    a: 'Yes. Reviews are shown on coach profiles after completed sessions.',
  },
]
const stepper = [
  {
    stage: 'Find a coach',
    detail: 'Search by sport, goals, and availability.',
  },
  {
    stage: 'Book a session',
    detail: 'Pick a session time and confirm instantly.',
  },
  {
    stage: 'Train regularly',
    detail: 'Track progress and message your coach.',
  },
]

const trustSignals = [
  'Verified coach reviews after completed sessions.',
  'Clear refund + dispute policies built into checkout.',
  'Secure payments with automatic receipts.',
]

const marketplaceHighlights = [
  {
    title: 'Sessions',
    body: '1:1 training and group sessions with flexible scheduling.',
  },
  {
    title: 'Bundles',
    body: 'Multi-session packages and seasonal plans.',
  },
  {
    title: 'Digital plans',
    body: 'Remote programs, video reviews, and drills.',
  },
]


export default function AthletesPage() {
  return (
    <main className="page-shell public-page">
      <AthletePortalGate />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="max-w-2xl">
          <div className="max-w-2xl">
            <p className="public-kicker">For athletes & parents</p>
            <h1 className="display text-4xl font-semibold leading-[1.06] text-[#191919] md:text-5xl">
              Find the right coach, stay accountable, see progress.
            </h1>
            <p className="mt-3 text-base text-[#4a4a4a] md:text-lg">
              A clean experience to book, chat, and track results with the
              coaches you trust—without juggling apps.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/signup" className="accent-button px-6 py-3">
                Find a coach
              </Link>
              <Link
                href="/athlete/marketplace"
                className="inline-flex items-center justify-center rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f7f6f4]"
              >
                Explore marketplace
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {stepper.map((item, index) => (
            <div
              key={item.stage}
              className="glass-card border border-[#191919] bg-white px-5 py-4 sm:px-6 sm:py-5"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#191919] bg-[#f5f5f5] text-base font-semibold text-[#191919]">
                  {index + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[1.45rem] font-semibold capitalize leading-[1.1] text-[#191919] sm:text-[1.55rem]">
                    {item.stage}
                  </p>
                  <p className="mt-1 text-[1.1rem] leading-[1.25] text-[#4a4a4a] sm:text-[1.15rem]">
                    {item.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
              Trust & safety
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
              Book with confidence.
            </h2>
            <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
              {trustSignals.map((signal) => (
                <div key={signal} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  {signal}
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Verified outcomes</p>
            <p className="mt-2 text-2xl font-semibold text-[#191919]">4.9★ average from verified athletes.</p>
            <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                “Found the right coach in a week. The reminders keep us on track.”
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                12,000+ completed sessions across all sports.
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Marketplace</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Sessions, bundles, and digital plans.</h2>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            {marketplaceHighlights.map((item) => (
              <div key={item.title} className="glass-card border border-[#191919] bg-white p-5">
                <h3 className="text-lg font-semibold text-[#191919]">{item.title}</h3>
                <p className="mt-3 text-sm text-[#4a4a4a]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Discover coaches</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Find your match.</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Browse coaches by sport, specialty, and availability. Filter by price and read verified reviews before booking.
            </p>
            <Link
              href="/signup"
              className="mt-4 inline-flex rounded-full bg-[#b80f0a] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Sign up to discover coaches
            </Link>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Availability</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Book when it works for you.</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Coach availability updates in real time. Pick an open slot, confirm, and get automatic reminders before your session.
            </p>
          </div>
        </section>

        {launchSurface.publicOrgEntryPointsEnabled ? (
          <section className="mt-12">
            <div className="glass-card relative border border-[#191919] bg-white p-6">
              <Link href="/organizations" className="accent-button mb-4 inline-flex px-6 py-3 md:absolute md:right-6 md:top-6 md:mb-0">
                Organization overview
              </Link>
              <div className="md:pr-44">
                <div className="max-w-2xl">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">For organizations</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Programs, billing, and access in one hub.</h2>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    Orgs can manage teams, compliance-ready fees, and reporting without extra tools. In an adult league or have kids on a team? Ask your organization to set up Coaches Hive for all-in-one ease and use.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-[#4a4a4a] md:grid-cols-3">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="font-semibold text-[#191919]">Automated fee reminders</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Keep payments on track without chasing families.</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="font-semibold text-[#191919]">Role-based access</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Admins, coaches, and staff each get the right view.</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="font-semibold text-[#191919]">Exportable reports</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Share billing, roster, and activity summaries.</p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">FAQs</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Answers for athletes & parents</h2>
            </div>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {athleteFaqs.map((item) => (
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

      </div>
    </main>
  )
}
