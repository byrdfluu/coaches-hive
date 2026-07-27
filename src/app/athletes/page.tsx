export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import AthletePortalGate from '@/components/AthletePortalGate'
import GetTheAppButton from '@/components/GetTheAppButton'
import RelationshipDiagram from '@/components/RelationshipDiagram'

export const metadata: Metadata = {
  title: 'Youth Sports Software for Athletes and Parents',
  description: 'Find coaches, manage schedules, make payments, sign waivers, and track training in one place.',
  alternates: { canonical: '/athletes' },
}

const barlow = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }

const FEATURES = [
  'Find coaches by sport, specialty, and availability',
  'Book sessions instantly with confirmed time slots',
  'Automatic reminders before every session',
  'Progress notes and wins from your coach after each session',
  'Secure payments with automatic receipts',
  'Clear refund and dispute policies',
]

const STEPS = [
  'Find your coach — search by sport, location, or org.',
  'Book a session and confirm your time slot.',
  'Track progress after every session.',
]

export default function AthletesPage() {
  return (
    <main className="public-page">
      <AthletePortalGate />

      {/* ── Section 1: What it looks like ── */}
      <section className="bg-[#191919] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#B80F0A]" style={barlow}>
            For athletes & parents
          </p>
          <div className="mt-6 grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h1 className="text-5xl font-semibold leading-none text-[#E8E8E8] sm:text-6xl lg:text-[4.5rem]">
                Find the right coach, stay accountable, see progress.
              </h1>
              <p className="mt-6 text-base leading-relaxed text-[#6b6b6b] sm:text-lg">
                Book sessions, track progress, and stay connected with your coach — all in one place.
              </p>
            </div>

            {/* Athlete Dashboard Mock */}
            <div className="space-y-3">
              {/* Upcoming session card */}
              <div className="overflow-hidden rounded-2xl border border-[#E0E0E0] bg-[#E8E8E8]">
                <div className="bg-[#B80F0A] px-4 py-2.5">
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.25em] text-white"
                    style={barlow}
                  >
                    Upcoming session
                  </p>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <p className="font-semibold text-[#191919]">Coach Jordan Davis</p>
                    <p className="text-sm text-[#4a4a4a]">Basketball · 1:1 Session</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#191919]">Fri, Jun 27</p>
                    <p className="text-xs text-[#4a4a4a]">10:00 AM</p>
                  </div>
                </div>
              </div>

              {/* Progress note */}
              <div className="rounded-2xl border border-[#E0E0E0] bg-[#E8E8E8] px-4 py-3.5">
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#4a4a4a]"
                  style={barlow}
                >
                  Coach note · Jun 20
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-[#191919]">
                  "Great footwork improvement this week. Focus on left-hand finishing before next session."
                </p>
              </div>

              {/* Payment receipt */}
              <div className="flex items-center justify-between rounded-2xl border border-[#E0E0E0] bg-[#E8E8E8] px-4 py-3">
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#4a4a4a]"
                    style={barlow}
                  >
                    Receipt · Jun 20
                  </p>
                  <p className="text-sm text-[#191919]">1:1 Session — Jordan Davis</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#191919]">$85.00</p>
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#2f7a4f]"
                    style={barlow}
                  >
                    Paid
                  </p>
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
            Everything you need to stay on track.
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
            Your coach handles the coaching. The platform handles the rest.
          </h2>

          <div className="mt-14">
            <RelationshipDiagram activeNode="athlete" />
          </div>

          <div className="mt-14 grid gap-10 sm:grid-cols-2">
            <div>
              <h3
                className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#BCFF1F]"
                style={barlow}
              >
                With your coach
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[#6b6b6b]">
                Once booked, your coach shares progress updates, next steps, and session notes directly through the platform. All your communication stays in one place — no chasing texts.
              </p>
            </div>
            <div>
              <h3
                className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#BCFF1F]"
                style={barlow}
              >
                Through your org
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[#6b6b6b]">
                If your athlete is part of a youth sports org on Coaches Hive, schedules, dues, and team updates come through the same login. One account covers everything.
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
            Three steps to your first session.
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
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <GetTheAppButton
              label="Find a coach"
              className="border-[#B80F0A] !bg-[#B80F0A] px-8 py-4 !text-white hover:opacity-90"
            />
          </div>
        </div>
      </section>

    </main>
  )
}
