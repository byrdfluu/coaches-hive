'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

type Clip = { src: string }

const FADE_MS = 500

function PreviewVideoCarousel({ clips }: { clips: Clip[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [fadingOutIndex, setFadingOutIndex] = useState<number | null>(null)
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const switchingRef = useRef(false)
  const activeIndexRef = useRef(0)

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  const advanceTo = useCallback((next: number) => {
    if (switchingRef.current) return
    switchingRef.current = true

    const prev = activeIndexRef.current
    const nextVideo = videoRefs.current[next]
    if (nextVideo) {
      nextVideo.currentTime = 0
      nextVideo.play().catch(() => null)
    }

    setFadingOutIndex(prev)
    setActiveIndex(next)
    activeIndexRef.current = next

    window.setTimeout(() => {
      const prevVideo = videoRefs.current[prev]
      if (prevVideo) {
        prevVideo.pause()
        prevVideo.currentTime = 0
      }
      setFadingOutIndex(null)
      switchingRef.current = false
    }, FADE_MS)
  }, [])

  // Play first clip on mount
  useEffect(() => {
    videoRefs.current[0]?.play().catch(() => null)
  }, [])

  // Pause when scrolled out of viewport, resume when back in
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          videoRefs.current[activeIndexRef.current]?.play().catch(() => null)
        } else {
          videoRefs.current.forEach((v) => v?.pause())
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-[#191919]"
      style={{ aspectRatio: '16/9' }}
    >
      {clips.map((clip, index) => {
        const isActive = index === activeIndex
        const isFading = index === fadingOutIndex
        return (
          <video
            key={clip.src}
            ref={(node) => {
              videoRefs.current[index] = node
            }}
            src={clip.src}
            muted
            playsInline
            preload="auto"
            onEnded={() => {
              if (activeIndexRef.current === index) {
                advanceTo((index + 1) % clips.length)
              }
            }}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[500ms] ease-in-out ${
              isActive ? 'opacity-100' : 'opacity-0'
            } ${isFading ? 'z-20' : isActive ? 'z-10' : 'z-0'}`}
          />
        )
      })}
    </div>
  )
}

function PreviewCard({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="glass-card flex flex-col overflow-hidden border border-[#191919]">
      <div className="p-7 pb-6">
        <p className="public-kicker">{kicker}</p>
        <h2 className="mt-2 text-xl font-semibold text-[#191919]">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#4a4a4a]">{description}</p>
      </div>
      <div className="mt-auto">{children}</div>
    </section>
  )
}

const COACH_CLIPS: Clip[] = [
  { src: '/Co Web Dashboard.mp4' },
  { src: '/Co Web Ath Page.mp4' },
  { src: '/Co Payouts Web.mp4' },
  { src: '/Co Marketplace Web.mp4' },
  { src: '/Co Calendar Web.mp4' },
]

const ATHLETE_CLIPS: Clip[] = [
  { src: '/Ath Web Dashboard.mp4' },
  { src: '/Ath Web Calendar.mp4' },
  { src: '/Ath Web Marketplace.mp4' },
]

export default function PlatformPreviewPage() {
  return (
    <main className="page-shell public-page">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">

        {/* Hero */}
        <div className="text-center">
          <p className="public-kicker">Platform preview</p>
          <h1 className="public-title mt-3">See exactly how Coaches Hive works</h1>
          <p className="public-copy mx-auto mt-4 max-w-2xl text-center">
            No signup required. Explore the coach experience, athlete portal, and guardian approval flow.
          </p>
        </div>

        {/* Top row — Coach + Athlete */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <PreviewCard
            kicker="Coach"
            title="Coach walkthrough"
            description="Roster management, session scheduling, payments, and earnings — all in one place."
          >
            <PreviewVideoCarousel clips={COACH_CLIPS} />
          </PreviewCard>

          <PreviewCard
            kicker="Athlete"
            title="Athlete experience"
            description="Dashboard, waiver signing, schedule view, and marketplace — built for athletes."
          >
            <PreviewVideoCarousel clips={ATHLETE_CLIPS} />
          </PreviewCard>
        </div>

        {/* Bottom row — Guardian centered below */}
        <div className="mt-6 flex justify-center">
          <div className="w-full md:w-[calc(50%-12px)]">
            <PreviewCard
              kicker="Guardian"
              title="Guardian approvals"
              description="How parents review and approve actions for their minor athletes, built in by default."
            >
              <div
                className="flex w-full items-center justify-center bg-[#191919]"
                style={{ aspectRatio: '16/9' }}
              >
                <p className="text-sm text-[#6b5f55]">Video coming soon</p>
              </div>
            </PreviewCard>
          </div>
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
