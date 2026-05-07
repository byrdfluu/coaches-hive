import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Platform Preview — Coaches Hive',
  description: 'See exactly how Coaches Hive works. Explore the coach dashboard, athlete portal, and guardian approval flow — no signup required.',
}

function VideoEmbed({ src, title }: { src?: string; title: string }) {
  if (!src) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-[#191919]">
        <p className="text-sm text-[#6b5f55]">Video coming soon</p>
      </div>
    )
  }
  return (
    <iframe
      src={src}
      title={title}
      className="aspect-video w-full"
      allowFullScreen
    />
  )
}

export default function PlatformPreviewPage() {
  return (
    <main className="page-shell public-page">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">

        {/* Hero */}
        <div className="text-center">
          <p className="public-kicker">Platform preview</p>
          <h1 className="public-title mt-3">See exactly how Coaches Hive works</h1>
          <p className="public-copy mx-auto mt-4 max-w-2xl text-center">
            No signup required. Explore the coach experience, athlete portal, and guardian approval flow.
          </p>
        </div>

        {/* Featured video — coach journey */}
        <section className="glass-card mt-12 overflow-hidden border border-[#191919]">
          <div className="p-6 pb-0">
            <p className="public-kicker">Full walkthrough</p>
            <h2 className="mt-1 text-xl font-semibold text-[#191919]">The coach journey</h2>
            <p className="mt-1 text-sm text-[#4a4a4a]">
              From onboarding to managing athletes, scheduling, payments, and waivers — all in one place.
            </p>
          </div>
          <div className="mt-4">
            <VideoEmbed title="Coaches Hive — full coach journey walkthrough" />
          </div>
        </section>

        {/* Role-specific videos */}
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <section className="glass-card overflow-hidden border border-[#191919]">
            <div className="p-5 pb-0">
              <p className="public-kicker">Coach</p>
              <h2 className="mt-1 text-base font-semibold text-[#191919]">Coach walkthrough</h2>
              <p className="mt-1 text-xs text-[#4a4a4a]">
                Roster management, session scheduling, and earnings overview.
              </p>
            </div>
            <div className="mt-4">
              <VideoEmbed title="Coach walkthrough" />
            </div>
          </section>

          <section className="glass-card overflow-hidden border border-[#191919]">
            <div className="p-5 pb-0">
              <p className="public-kicker">Athlete</p>
              <h2 className="mt-1 text-base font-semibold text-[#191919]">Athlete experience</h2>
              <p className="mt-1 text-xs text-[#4a4a4a]">
                Dashboard, waiver signing, schedule view, and marketplace.
              </p>
            </div>
            <div className="mt-4">
              <VideoEmbed title="Athlete experience" />
            </div>
          </section>

          <section className="glass-card overflow-hidden border border-[#191919]">
            <div className="p-5 pb-0">
              <p className="public-kicker">Guardian</p>
              <h2 className="mt-1 text-base font-semibold text-[#191919]">Guardian approvals</h2>
              <p className="mt-1 text-xs text-[#4a4a4a]">
                How parents review and approve actions for their minor athletes.
              </p>
            </div>
            <div className="mt-4">
              <VideoEmbed title="Guardian approvals" />
            </div>
          </section>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-lg font-semibold text-[#191919]">Ready to get started?</p>
          <p className="mt-1 text-sm text-[#4a4a4a]">Free for 7 days — no credit card required.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="accent-button px-6 py-3">
              Start free trial →
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-[#191919] px-6 py-3 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-white"
            >
              View pricing
            </Link>
          </div>
        </div>

      </div>
    </main>
  )
}
