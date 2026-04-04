import Link from 'next/link'
import { launchSurface } from '@/lib/launchSurface'
const coachFaqs = [
  {
    q: 'How do platform fees work for sessions and marketplace sales?',
    a: 'Session fees are tier-based, while marketplace sales have a flat fee. You can see estimated fees in your dashboard and revenue reports.',
  },
  {
    q: 'Can I offer packages, subscriptions, or digital products?',
    a: 'Yes. You can create 1:1 sessions, bundles, subscriptions, and digital or physical products in Marketplace.',
  },
  {
    q: 'How do payouts work and when do I get paid?',
    a: 'Payments are collected in-app and payouts are scheduled automatically based on your payout settings.',
  },
  {
    q: 'Can I message athletes and share files?',
    a: 'Yes. Messaging supports 1-on-1 chats and file attachments so everything stays in one thread.',
  },
  {
    q: 'How do I manage availability and reschedules?',
    a: 'Set availability in Calendar and manage bookings directly from your schedule. Reschedules update both you and the athlete.',
  },
  {
    q: 'Can I run group sessions or camps?',
    a: 'Yes. You can create group sessions and camps as products or scheduled sessions.',
  },
]
const valueProps = [
  {
    title: 'Bookings',
    body: 'Availability, instant booking, and automated reminders in one flow.',
  },
  {
    title: 'Payouts',
    body: 'Clear fees, fast payouts, and revenue visibility for every session.',
  },
  {
    title: 'Programs',
    body: 'Sell 1:1 sessions, subscriptions, and digital training products.',
  },
  {
    title: 'Reviews',
    body: 'Verified reviews build trust and highlight your best results.',
  },
  {
    title: 'Reports',
    body: 'Track bookings, payouts, and growth with clear performance reports.',
  },
]

const coachOffers = [
  { label: '1:1 Speed Lab', detail: '60 min · In-person or remote · $120' },
  { label: 'Team strength block', detail: '90 min · Up to 12 athletes · $280' },
  { label: 'Remote video review', detail: 'Asynchronous · 48-hour turnaround · $65' },
]


const steps = [
  {
    title: 'Create Your Profile',
    detail:
      'Sign up, showcase your experience, set your rates, and highlight your specialties so athletes and parents can easily find and trust you.',
  },
  {
    title: 'Manage Your Business',
    detail:
      'Handle bookings, payments, and messaging all in one place — no more juggling multiple apps or chasing clients.',
  },
  {
    title: 'Grow & Get Paid',
    detail:
      'Reach new athletes, build long-term relationships, sell training programs, and track your earnings with secure, transparent payouts.',
  },
]

const highlights = [
  ['Avg. setup time', '12 minutes'],
  ['Coaches retaining', '93%'],
  ['Repeat bookings lift', '+28%'],
  ['Support response', '< 5 minutes'],
]

export default function CoachesPage() {
  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <p className="public-kicker">For coaches</p>
            <h1 className="display text-4xl font-semibold leading-[1.06] text-[#191919] md:text-5xl">
              Grow your coaching business without admin drag.
            </h1>
            <p className="max-w-2xl text-base text-[#4a4a4a] md:text-lg">
              Launch offers, automate scheduling, and keep athletes engaged in a single
              streamlined workspace.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="accent-button px-6 py-3">
                Start coaching
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-[30px] border border-[#e3e3e3] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
            <div className="grid min-h-[340px] lg:min-h-[380px] md:grid-cols-[34%_66%]">
              <div className="min-h-[170px] md:min-h-full">
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: 'url(/athlete-03.jpg)' }}
                  aria-hidden
                />
              </div>
              <div className="flex flex-col p-4 sm:p-5 md:p-5">
                <div>
                  <p className="text-[clamp(1.6rem,2.4vw,2.4rem)] font-bold uppercase leading-[1] tracking-[0.08em] text-[#b80f0a]">
                    Your Name
                  </p>
                  <p className="mt-1.5 text-[clamp(0.9rem,1vw,1.05rem)] text-[#5f5f5f]">
                    Your Sport · Your Experience
                  </p>
                </div>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-[18px] bg-[#f4f4f4] p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a7a7a]">Rating</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[1.85rem] font-semibold leading-none text-[#1f1f1f]">4.9★</span>
                    </div>
                  </div>
                  <div className="rounded-[18px] bg-[#f4f4f4] p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a7a7a]">Verified</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[1.85rem] font-semibold leading-none text-[#1f1f1f]">Yes</span>
                      <span className="text-[2.1rem] leading-none text-[#4a4a4a]">✓</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 divide-y divide-[#e3e3e3]">
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[clamp(0.9rem,0.95vw,1.05rem)] text-[#5f5f5f]">Avg response time</span>
                    <span className="text-[clamp(0.9rem,0.95vw,1.05rem)] font-semibold text-[#1f1f1f]">12 min</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[clamp(0.9rem,0.95vw,1.05rem)] text-[#5f5f5f]">Next available</span>
                    <span className="text-[clamp(0.9rem,0.95vw,1.05rem)] font-semibold text-[#1f1f1f]">Tomorrow · 5:30 PM</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[clamp(0.9rem,0.95vw,1.05rem)] text-[#5f5f5f]">Accessibility</span>
                    <span className="text-[clamp(0.9rem,0.95vw,1.05rem)] font-semibold text-[#1f1f1f]">Remote + In-person</span>
                  </div>
                </div>

                <Link
                  href="/signup"
                  className="mt-4 inline-flex h-10 w-fit items-center justify-center rounded-full border border-[#d6d9de] bg-white px-6 text-base font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f7f7f7]"
                >
                  View profile
                </Link>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-12">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">What you get</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Everything you need to run sessions and programs.</h2>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            {valueProps.map((item) => (
              <div
                key={item.title}
                className="glass-card border border-[#191919] bg-white p-5"
              >
                <h3 className="text-lg font-semibold text-[#191919]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm text-[#4a4a4a]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
              Offerings
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
              Sell sessions, bundles, and programs.
            </h2>
            <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
              {coachOffers.map((offer) => (
                <div key={offer.label} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <span className="font-semibold text-[#191919]">{offer.label}</span>
                  <span>{offer.detail}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Client experience</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Keep athletes coming back.</h2>
            <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold text-[#191919]">Automated reminders</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">Reduce no-shows and keep sessions consistent.</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold text-[#191919]">Progress check-ins</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">Share wins and next steps after each session.</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold text-[#191919]">Coach responses</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">Reply to reviews to build credibility.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Reviews</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Verified feedback from athletes.</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="glass-card border border-[#191919] bg-white p-5 text-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">How it works</p>
              <p className="mt-2 text-sm text-[#4a4a4a]">
                After each completed session, athletes are prompted to leave a verified review. Reviews appear on your public profile and help future athletes find and trust you.
              </p>
            </div>
            <div className="glass-card border border-[#191919] bg-white p-5 text-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coach responses</p>
              <p className="mt-2 text-sm text-[#4a4a4a]">
                Respond to reviews directly from your dashboard to highlight your coaching style and build long-term athlete relationships.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Capacity</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">See what’s open this week.</h2>
            <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
              {[
                ['Mon', '2 slots open · 4:00-6:00 PM'],
                ['Wed', '1 slot open · 5:00 PM'],
                ['Fri', '3 slots open · 3:00-6:00 PM'],
              ].map(([day, detail]) => (
                <div key={day} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <span className="font-semibold text-[#191919]">{day}</span>
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Earnings</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Payouts and revenue at a glance.</h2>
            <div className="mt-4 grid gap-3 text-sm text-[#4a4a4a]">
              <div className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <span>Projected this month</span>
                <span className="font-semibold text-[#191919]">$3,240</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <span>Next payout</span>
                <span className="font-semibold text-[#191919]">Friday · $820</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <span>Active subscriptions</span>
                <span className="font-semibold text-[#191919]">18</span>
              </div>
            </div>
          </div>
        </section>

        {launchSurface.publicOrgEntryPointsEnabled ? (
          <section className="mt-12">
            <div className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">For organizations</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Need a full org view?</h2>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    Keep compliance-ready billing, role-based access, and exportable reports in one place.
                  </p>
                </div>
                <Link href="/organizations" className="accent-button px-6 py-3">
                  Organization overview
                </Link>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-[#4a4a4a] md:grid-cols-3">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="font-semibold text-[#191919]">Compliance-ready billing</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Collect fees, track invoices, and stay audit ready.</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="font-semibold text-[#191919]">Role-based access</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Admins, coaches, and staff each get the right tools.</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="font-semibold text-[#191919]">Exportable reports</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Share finance, roster, and performance reports fast.</p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">FAQs</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Answers for coaches</h2>
            </div>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {coachFaqs.map((item) => (
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

        <section className="mt-12">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Start coaching</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Launch in three simple steps.</h2>
              </div>
              <Link href="/signup" className="accent-button px-6 py-3">
                Create coach profile
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
                      <p className="font-semibold text-[#191919]">
                        {step.title}
                      </p>
                      <p className="text-sm text-[#4a4a4a]">{step.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </main>
  )
}
