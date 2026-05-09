'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

type Clip = { src: string }

const FADE_MS = 500
const CLIP_DURATION_MS = 5000

function PreviewVideoCarousel({ clips }: { clips: Clip[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [fadingOutIndex, setFadingOutIndex] = useState<number | null>(null)
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const switchingRef = useRef(false)

  // Play first clip on mount
  useEffect(() => {
    videoRefs.current[0]?.play().catch(() => null)
  }, [])

  // Auto-advance on a fixed interval
  useEffect(() => {
    if (clips.length < 2) return
    const timer = window.setTimeout(() => {
      if (switchingRef.current) return
      switchingRef.current = true

      const prev = activeIndex
      const next = (activeIndex + 1) % clips.length

      const nextVideo = videoRefs.current[next]
      if (nextVideo) {
        nextVideo.currentTime = 0
        nextVideo.play().catch(() => null)
      }

      setFadingOutIndex(prev)
      setActiveIndex(next)

      window.setTimeout(() => {
        const prevVideo = videoRefs.current[prev]
        if (prevVideo) {
          prevVideo.pause()
          prevVideo.currentTime = 0
        }
        setFadingOutIndex(null)
        switchingRef.current = false
      }, FADE_MS)
    }, CLIP_DURATION_MS)

    return () => window.clearTimeout(timer)
  }, [activeIndex, clips.length])

  // Pause when scrolled out of viewport, resume when back in
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          videoRefs.current[activeIndex]?.play().catch(() => null)
        } else {
          videoRefs.current.forEach((v) => v?.pause())
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [activeIndex])

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden bg-[#191919]" style={{ aspectRatio: '16/9' }}>
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
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[500ms] ease-in-out ${
              isActive ? 'opacity-100' : 'opacity-0'
            } ${isFading ? 'z-20' : isActive ? 'z-10' : 'z-0'}`}
          />
        )
      })}
    </div>
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

          <section className="glass-card overflow-hidden border border-[#191919]">
            <div className="p-6 pb-5">
              <p className="public-kicker">Coach</p>
              <h2 className="mt-2 text-xl font-semibold text-[#191919]">Coach walkthrough</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[#4a4a4a]">
                Roster management, session scheduling, payments, and earnings.
              </p>
            </div>
            <PreviewVideoCarousel clips={COACH_CLIPS} />
          </section>

          <section className="glass-card overflow-hidden border border-[#191919]">
            <div className="p-6 pb-5">
              <p className="public-kicker">Athlete</p>
              <h2 className="mt-2 text-xl font-semibold text-[#191919]">Athlete experience</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[#4a4a4a]">
                Dashboard, waiver signing, schedule view, and marketplace.
              </p>
            </div>
            <PreviewVideoCarousel clips={ATHLETE_CLIPS} />
          </section>

        </div>

        {/* Bottom row — Guardian centered below */}
        <div className="mt-6 flex justify-center">
          <section className="glass-card w-full overflow-hidden border border-[#191919] md:w-[calc(50%-12px)]">
            <div className="p-6 pb-5">
              <p className="public-kicker">Guardian</p>
              <h2 className="mt-2 text-xl font-semibold text-[#191919]">Guardian approvals</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[#4a4a4a]">
                How parents review and approve actions for their minor athletes.
              </p>
            </div>
            <div className="flex w-full items-center justify-center bg-[#191919]" style={{ aspectRatio: '16/9' }}>
              <p className="text-sm text-[#6b5f55]">Video coming soon</p>
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
