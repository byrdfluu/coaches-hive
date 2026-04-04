import Link from 'next/link'
import HeroVideoCarousel from '@/components/HeroVideoCarousel'
import HomeFeatureTabs from '@/components/HomeFeatureTabs'
import HomeRoleSelector from '@/components/HomeRoleSelector'
import SportsTicker from '@/components/SportsTicker'
import { launchSurface } from '@/lib/launchSurface'

const faqs = [
  {
    q: 'How do I choose the right coach?',
    a: 'Use Discover to filter by sport, goals, availability, pricing, and reviews, then compare profiles and message coaches before booking.',
  },
  {
    q: 'Can I switch coaches or pause training at any time?',
    a: 'Yes. You can book with another coach anytime and pause or reschedule upcoming sessions without losing your account.',
  },
  {
    q: 'How do payments and platform fees work?',
    a: 'Payments are processed in-app. Athletes see totals upfront, and coaches see platform fees deducted from payouts.',
  },
  {
    q: 'How do I book, reschedule, or cancel a session?',
    a: 'Go to the coach profile or your calendar, pick a time, and confirm. Reschedule or cancel from your bookings list.',
  },
  {
    q: 'Can parents manage multiple athletes under one account?',
    a: 'Yes. Family tiers support multiple athlete profiles with a unified dashboard and combined calendar.',
  },
  {
    q: 'What happens if I need a refund or have a dispute?',
    a: 'Contact support from your account or the Contact Us page. Disputes are reviewed under platform policies.',
  },
]

const heroVideoClips = [
  { src: '/clip-2.mp4', maxSeconds: 4 },
  { src: '/clip-1.mp4' },
  { src: '/clip-3.mp4', maxSeconds: 4 },
  { src: '/clip-4.mp4', maxSeconds: 6 },
]

export default function Home() {
  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <section className="glass-card card-hero card-accent relative mt-8 overflow-hidden bg-white p-5 sm:mt-12 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -left-24 top-10 h-56 w-56 rounded-full bg-[#b80f0a]/10 blur-[120px]" />
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#191919]/10 blur-[140px]" />
          <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            <div className="animate-rise min-w-0 space-y-5 sm:space-y-6">
              <span className="public-kicker">All-in-one coaching platform</span>
              <h1
                className="display break-words text-[2.7rem] font-semibold leading-[1.03] text-[#1f1c18] sm:text-[4rem]"
                data-testid="hero-title"
              >
                {launchSurface.publicOrgEntryPointsEnabled
                  ? 'Empowering coaches, supporting athletes, and uniting organizations.'
                  : 'Empowering coaches and supporting athletes.'}
              </h1>
              <p className="max-w-xl text-[1.08rem] leading-snug text-[#666] sm:text-[1.45rem]">
                {launchSurface.publicOrgEntryPointsEnabled
                  ? 'Scheduling, messaging, payments, and progress tracking built for athletes, coaches, and organizations.'
                  : 'Scheduling, messaging, payments, and progress tracking built for athletes and coaches.'}
              </p>
              <p className="max-w-xl text-[1.08rem] leading-snug text-[#666] sm:text-[1.45rem]">
                {launchSurface.publicOrgEntryPointsEnabled
                  ? 'Built for youth and adult athletes, coaches, and organizations.'
                  : 'Built for youth and adult athletes working with trusted coaches.'}
              </p>
              <HomeRoleSelector
                options={launchSurface.publicOrgEntryPointsEnabled
                  ? [
                      { label: 'Coach', href: '/coach' },
                      { label: 'Athlete/Parent', href: '/athlete' },
                      { label: 'Organization', href: '/organizations' },
                    ]
                  : [
                      { label: 'Coach', href: '/coach' },
                      { label: 'Athlete/Parent', href: '/athlete' },
                    ]}
              />
            </div>

            <div className="grid min-w-0 gap-4 lg:mt-6">
              <div className="glass-card card-accent animate-float overflow-hidden rounded-[20px] bg-white p-0">
                <HeroVideoCarousel clips={heroVideoClips} className="h-[320px]" />
              </div>
            </div>
          </div>
          <SportsTicker />
        </section>

        <HomeFeatureTabs />

        <section className="mt-16">
          <div className="relative overflow-hidden rounded-3xl border border-[#191919] bg-white/70 p-6 shadow-sm md:p-8">
            <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[#191919]/10 blur-3xl" />
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Why it works</p>
                <h2 className="mt-2 text-3xl font-semibold text-[#1f1c18]">
                  {launchSurface.publicOrgEntryPointsEnabled
                    ? 'One workflow for athletes, coaches, and org admins.'
                    : 'One workflow for athletes and coaches.'}
                </h2>
                <p className="mt-3 text-sm text-[#4a4a4a]">
                  Bookings, messaging, and payments stay connected so everyone stays aligned.
                </p>
              </div>
              <div className="space-y-4">
                {[
                  {
                    title: 'Scheduling + Payments',
                    body: 'Book sessions and collect payouts in the same flow.',
                  },
                  {
                    title: 'Connection + Growth',
                    body: 'Match with the right athletes and teams faster.',
                  },
                  {
                    title: 'Progress + Retention',
                    body: 'Track outcomes and keep everyone aligned.',
                  },
                ].map((item, index) => (
                  <div
                    key={item.title}
                    className="group flex flex-col gap-4 rounded-2xl border border-[#191919] bg-white p-5 shadow-sm md:flex-row md:items-start"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] bg-[#f5f5f5] text-[11px] font-semibold text-[#191919]">
                      {`0${index + 1}`}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#1f1c18]">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-sm text-[#4a4a4a]">
                        {item.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold text-[#1f1c18]">
              From signup to first session in minutes.
            </h2>
            <p className="mt-3 text-sm text-[#4a4a4a]">
              Create a profile, connect with a coach, and keep training on track with built-in reminders.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                'Create your profile and goals.',
                'Pick a coach and book your first session.',
                'Track progress and stay accountable.',
              ].map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-2xl border border-[#191919] bg-white/80 p-4 text-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] bg-[#f5f5f5] text-[11px] font-semibold text-[#191919]">
                    {index + 1}
                  </span>
                  <p className="text-sm text-[#191919]">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-3">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">For athletes</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1f1c18]">Train with clarity and accountability.</h2>
            <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
              <li>• Trusted coaches with verified reviews.</li>
              <li>• Simple booking and calendar sync.</li>
              <li>• Progress tracking and reminders.</li>
            </ul>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">For coaches</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1f1c18]">Run your business without extra tools.</h2>
            <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
              <li>• Bookings, payouts, and messaging in one hub.</li>
              <li>• Sell programs, subscriptions, and products.</li>
              <li>• Insights on retention and revenue.</li>
            </ul>
          </div>
          {launchSurface.publicOrgEntryPointsEnabled ? (
            <div className="glass-card border border-[#191919] bg-white p-6">
              <p className="whitespace-nowrap text-xs uppercase tracking-[0.3em] text-[#6b5f55]">For organizations</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#1f1c18]">Keep teams, billing, and access aligned.</h2>
              <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
                <li>• Compliance-ready billing and reporting.</li>
                <li>• Role-based access for admins and coaches.</li>
                <li>• Automated fee reminders and exports.</li>
              </ul>
            </div>
          ) : null}
        </section>

        <section className="mt-16 rounded-3xl border border-[#191919] bg-white/80 p-6 text-center shadow-sm">
          <h3 className="text-2xl font-semibold text-[#1f1c18]">Ready to get started?</h3>
          <p className="mt-2 text-sm text-[#4a4a4a]">Join and book your first session in minutes.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="accent-button px-6 py-3">Create account</Link>
          </div>
        </section>

        <section className="mt-16">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">FAQs</p>
            <h2 className="mt-2 text-3xl font-semibold text-[#1f1c18]">Quick answers</h2>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
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


      </div>
    </main>
  )
}
