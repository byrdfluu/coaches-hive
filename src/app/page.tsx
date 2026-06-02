import Link from 'next/link'
import HeroVideoCarousel from '@/components/HeroVideoCarousel'
import HomeFeatureTabs from '@/components/HomeFeatureTabs'
import HomeTestimonials from '@/components/HomeTestimonials'
import NewsletterSignup from '@/components/NewsletterSignup'
import SportsTicker from '@/components/SportsTicker'

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
                Coaching built for your business.
              </h1>
              <p className="max-w-xl text-[1.08rem] leading-snug text-[#666] sm:text-[1.45rem]">
                Programs, payments, waivers, and clients — all in one place.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative inline-flex w-fit rounded-full border border-[#d7d7d7] bg-white p-1 shadow-[0_8px_24px_rgba(25,25,25,0.08)]">
                  <span className="absolute -top-3 left-6 bg-white px-2 text-[11px] font-medium tracking-[0.08em] text-[#6b6b6b]">
                    I am a:
                  </span>
                  <span className="rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white">
                    Coach
                  </span>
                </div>
                <Link
                  href="/signup"
                  className="accent-button px-6 py-2.5 text-sm"
                >
                  Start free trial →
                </Link>
              </div>
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
                  Most coaches lose hours every week to admin.
                </h2>
                <p className="mt-3 text-sm text-[#4a4a4a]">
                  Juggling payments, managing messages across platforms, and manually tracking who showed up adds up fast. Coaches Hive handles all of it so you can focus on actually coaching.
                </p>
              </div>
              <div className="space-y-4">
                {[
                  {
                    title: 'Back a session. Get paid. Done.',
                    body: '',
                  },
                  {
                    title: 'Find athletes. Fill your roster.',
                    body: '',
                  },
                  {
                    title: 'Keep clients longer.',
                    body: '',
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
                      {item.body ? (
                        <p className="mt-2 text-sm text-[#4a4a4a]">
                          {item.body}
                        </p>
                      ) : null}
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
              Clear paths for athletes and coaches.
            </h2>
            <p className="mt-3 text-sm text-[#4a4a4a]">
              Athletes need a simple way to get started, and coaches need to see how fast they can set up, get discovered, and run everything from one place.
            </p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-[#191919] bg-white/80 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[#6b5f55]">Athlete flow</p>
                <div className="mt-4 grid gap-3">
                  {[
                    'Create your profile and goals.',
                    'Pick a coach and book your first session.',
                    'Track progress and stay accountable.',
                  ].map((step, index) => (
                    <div key={step} className="flex items-center gap-3 rounded-2xl border border-[#191919] bg-white p-4 text-sm">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] bg-[#f5f5f5] text-[11px] font-semibold text-[#191919]">
                        {index + 1}
                      </span>
                      <p className="text-sm text-[#191919]">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-[#191919] bg-white/80 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[#6b5f55]">Coach flow</p>
                <div className="mt-4 grid gap-3">
                  {[
                    'Set up your profile and availability in under 10 minutes.',
                    'Get discovered by athletes looking for your sport.',
                    'Run bookings, payments, and messages from one place.',
                  ].map((step, index) => (
                    <div key={step} className="flex items-center gap-3 rounded-2xl border border-[#191919] bg-white p-4 text-sm">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] bg-[#f5f5f5] text-[11px] font-semibold text-[#191919]">
                        {index + 1}
                      </span>
                      <p className="text-sm text-[#191919]">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-3">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">For athletes</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1f1c18]">Train with clarity and accountability.</h2>
            <p className="mt-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#b80f0a] px-3 py-1 text-[11px] font-semibold text-[#b80f0a]">
              Free to join — no credit card required
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
              <li>• Trusted coaches with verified reviews.</li>
              <li>• Simple booking and calendar sync.</li>
              <li>• Progress tracking and reminders.</li>
              <li>• Message your coach directly from the app.</li>
            </ul>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">For coaches</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1f1c18]">Your coaching is elite. The business side should not take more time than the coaching itself.</h2>
            <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
              <li>• Stop switching between whatever tools you&apos;re patching together just to run a session.</li>
              <li>• Sell programs and subscriptions without building a separate storefront.</li>
              <li>• Know which athletes need a check-in before they go quiet.</li>
            </ul>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="whitespace-nowrap text-xs uppercase tracking-[0.3em] text-[#6b5f55]">For organizations</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1f1c18]">Keep teams, billing, and access aligned.</h2>
            <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
              <li>• Compliance-ready billing and reporting.</li>
              <li>• Role-based access for admins and coaches.</li>
              <li>• Automated fee reminders and exports.</li>
            </ul>
          </div>
        </section>

        <HomeTestimonials />

        <section className="mt-16">
          <NewsletterSignup />
        </section>

        <section className="mt-16 rounded-3xl border border-[#191919] bg-white/80 p-6 text-center shadow-sm">
          <h3 className="text-2xl font-semibold text-[#1f1c18]">Ready to stop duct-taping your business together?</h3>
          <p className="mt-2 text-sm text-[#4a4a4a]">Join coaches already running everything in one place.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="accent-button px-6 py-3">Create account</Link>
            <Link href="/platform-preview" className="rounded-full border border-[#191919] px-6 py-3 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-white">
              See how it works →
            </Link>
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
