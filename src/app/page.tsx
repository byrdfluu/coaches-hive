import Link from 'next/link'
import HeroVideoCarousel from '@/components/HeroVideoCarousel'
import HomeFeatureTabs from '@/components/HomeFeatureTabs'
import HomeTestimonials from '@/components/HomeTestimonials'
import SportsTicker from '@/components/SportsTicker'

const faqs = [
  {
    q: 'How long does it take to get set up?',
    a: 'Most coaches have their profile, availability, and payment setup done in under 30 minutes. No technical experience needed.',
  },
  {
    q: 'Do I have to move all my athletes over at once?',
    a: "No. Most coaches start with one or two athletes to get comfortable before moving everyone over. There's no pressure to switch overnight.",
  },
  {
    q: 'Is Coaches Hive only for online coaching?',
    a: "No. It works for in-person, online, and hybrid coaching. Whether you train athletes at a field, a gym, or over video — the platform works the same way.",
  },
  {
    q: 'What age group is Coaches Hive built for?',
    a: "Coaches who work with youth athletes — from youth leagues up through high school. Athletes and their families can both be managed through the platform.",
  },
  {
    q: 'What tools does Coaches Hive replace?',
    a: 'It replaces scattered texts, Venmo payment requests, paper waivers, and separate scheduling tools — all in one subscription.',
  },
  {
    q: 'How do waivers work?',
    a: "You create a waiver once and send it to any athlete before their first session. Everything is signed and stored digitally — no paper, no chasing.",
  },
  {
    q: "Can I sell programs to athletes I don't train directly?",
    a: "Yes. You can list programs in the marketplace and sell to any athlete — not just the ones you currently train.",
  },
  {
    q: 'How do I get paid?',
    a: "Payments go directly to your connected Stripe account. You can charge for sessions, sell memberships, or sell programs. Payouts go to your bank on Stripe's standard schedule.",
  },
  {
    q: 'What happens if I want to cancel?',
    a: "You can cancel anytime from your account settings. Your data doesn't disappear — you'll have time to export anything you need before your access ends.",
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
              <h1
                className="display break-words text-[2.7rem] font-semibold leading-[1.03] text-[#1f1c18] sm:text-[4rem]"
                data-testid="hero-title"
              >
                One place to run your private coaching business.
              </h1>
              <p className="max-w-xl text-[1.08rem] leading-snug text-[#666] sm:text-[1.45rem]">
                Scheduling, payments, waivers, and programs — built for coaches who train youth athletes.
              </p>
              <div className="relative inline-flex w-fit rounded-full border border-[#d7d7d7] bg-white p-1 shadow-[0_8px_24px_rgba(25,25,25,0.08)]">
                <span className="absolute -top-3 left-6 bg-white px-2 text-[11px] font-medium tracking-[0.08em] text-[#6b6b6b]">
                  I am a Coach
                </span>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#b80f0a] px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
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
                    title: 'Book a session. Get paid. Done.',
                    body: '',
                  },
                  {
                    title: 'Grow your roster.',
                    body: '',
                  },
                  {
                    title: 'Keep athletes longer.',
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
          <div className="text-center">
            <h2 className="display text-3xl font-semibold text-[#1f1c18] sm:text-4xl">For coaches at every level.</h2>
            <p className="mt-3 text-sm text-[#6b6b6b]">Whether you&apos;re just starting or fully booked, Coaches Hive is built for where you are and where you&apos;re going next.</p>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <div className="glass-card flex flex-col border border-[#191919] bg-white p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">New Coach</p>
              <img
                src="/home/new-coach.jpg"
                alt="Coach speaking with athletes during a team huddle"
                className="mt-4 aspect-[4/3] w-full rounded-2xl border border-[#dcdcdc] object-cover"
              />
              <h2 className="mt-2 text-2xl font-semibold text-[#1f1c18]">Look established before you feel it.</h2>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-[#4a4a4a]">You just started taking on private athletes. Get a professional setup from day one.</p>
              <Link href="/signup" className="mt-6 inline-flex items-center text-sm font-semibold text-[#b80f0a] hover:underline">Start for free →</Link>
            </div>
            <div className="glass-card flex flex-col border border-[#191919] bg-white p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Growing Coach</p>
              <img
                src="/home/growing-coach.jpg"
                alt="Coach speaking to athletes in red jerseys"
                className="mt-4 aspect-[4/3] w-full rounded-2xl border border-[#dcdcdc] object-cover"
              />
              <h2 className="mt-2 text-2xl font-semibold text-[#1f1c18]">Stop letting admin steal your coaching hours.</h2>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-[#4a4a4a]">You have consistent athletes but the admin is taking over. Let Coaches Hive handle the business side.</p>
              <Link href="/signup" className="mt-6 inline-flex items-center text-sm font-semibold text-[#b80f0a] hover:underline">Start for free →</Link>
            </div>
            <div className="glass-card flex flex-col border border-[#191919] bg-white p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Established Coach</p>
              <img
                src="/home/established-coach.jpg"
                alt="Coach standing on a soccer field during practice"
                className="mt-4 aspect-[4/3] w-full rounded-2xl border border-[#dcdcdc] object-cover"
              />
              <h2 className="mt-2 text-2xl font-semibold text-[#1f1c18]">One place to run everything.</h2>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-[#4a4a4a]">You&apos;re running multiple athletes and selling programs. Keep everything in one place.</p>
              <Link href="/signup" className="mt-6 inline-flex items-center text-sm font-semibold text-[#b80f0a] hover:underline">Start for free →</Link>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold text-[#1f1c18]">
              Up and running in three steps.
            </h2>
            <p className="mt-3 text-sm text-[#4a4a4a]">
              No lengthy onboarding. No technical setup. Just your coaching business, simplified.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                'Set up your profile, availability, and payment in under 10 minutes.',
                'Add your athletes, build your first program, and send your first waiver.',
                'Run bookings, payments, and messaging from one place.',
              ].map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-2xl border border-[#191919] bg-white p-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#191919] bg-[#f5f5f5] text-[11px] font-semibold text-[#191919]">
                    {index + 1}
                  </span>
                  <p className="text-sm text-[#191919]">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <HomeTestimonials />


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
