'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

type Clip = { src: string }

const FADE_MS = 500

function PreviewVideoCarousel({ clips, title }: { clips: Clip[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [fadingOutIndex, setFadingOutIndex] = useState<number | null>(null)
  const [controlled, setControlled] = useState(false)
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const switchingRef = useRef(false)
  const clipTimerRef = useRef<number | null>(null)
  const fadeTimerRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (clipTimerRef.current) window.clearTimeout(clipTimerRef.current)
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current)
  }, [])

  const advance = useCallback(() => {
    if (clips.length < 2 || switchingRef.current || controlled) return
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
    fadeTimerRef.current = window.setTimeout(() => {
      const prevVideo = videoRefs.current[prev]
      if (prevVideo) {
        prevVideo.pause()
        prevVideo.currentTime = 0
      }
      setFadingOutIndex(null)
      switchingRef.current = false
    }, FADE_MS)
  }, [activeIndex, clips.length, controlled])

  // Auto-advance timer — resets whenever activeIndex or controlled changes
  useEffect(() => {
    if (controlled) return
    clipTimerRef.current = window.setTimeout(advance, 5000)
    return clearTimers
  }, [activeIndex, advance, controlled, clearTimers])

  // Start first clip on mount
  useEffect(() => {
    const video = videoRefs.current[0]
    if (video) video.play().catch(() => null)
    return clearTimers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pause when scrolled out of viewport, resume when scrolled back in
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!controlled) {
            const video = videoRefs.current[activeIndex]
            video?.play().catch(() => null)
          }
        } else {
          videoRefs.current.forEach((v) => v?.pause())
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [activeIndex, controlled])

  const enterControlled = useCallback(() => {
    clearTimers()
    setControlled(true)
  }, [clearTimers])

  const exitControlled = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setControlled(false)
      const video = videoRefs.current[activeIndex]
      if (video) {
        video.currentTime = 0
        video.play().catch(() => null)
      }
    },
    [activeIndex],
  )

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full cursor-pointer overflow-hidden bg-[#191919]"
      onClick={!controlled ? enterControlled : undefined}
      aria-label={title}
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
            preload={index === 0 ? 'auto' : 'none'}
            controls={controlled && isActive}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[500ms] ease-in-out ${
              isActive ? 'opacity-100' : 'opacity-0'
            } ${isFading ? 'z-20' : isActive ? 'z-10' : 'z-0'}`}
          />
        )
      })}

      {!controlled && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden>
            <polygon points="1,0 8,4 1,8" />
          </svg>
          Click to control
        </div>
      )}

      {controlled && (
        <button
          type="button"
          onClick={exitControlled}
          className="absolute left-3 top-3 z-30 rounded-full bg-black/50 px-3 py-1.5 text-[10px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/70"
        >
          ← Back to preview
        </button>
      )}
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

        {/* Role cards */}
        <div className="mt-12 grid gap-7 lg:grid-cols-3">

          {/* Coach */}
          <section className="glass-card overflow-hidden border border-[#191919]">
            <div className="p-6 pb-5 sm:p-7 sm:pb-6">
              <p className="public-kicker">Coach</p>
              <h2 className="mt-2 text-xl font-semibold text-[#191919]">Coach walkthrough</h2>
              <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">
                Roster management, session scheduling, and earnings overview.
              </p>
            </div>
            <PreviewVideoCarousel clips={COACH_CLIPS} title="Coach walkthrough" />
          </section>

          {/* Athlete */}
          <section className="glass-card overflow-hidden border border-[#191919]">
            <div className="p-6 pb-5 sm:p-7 sm:pb-6">
              <p className="public-kicker">Athlete</p>
              <h2 className="mt-2 text-xl font-semibold text-[#191919]">Athlete experience</h2>
              <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">
                Dashboard, waiver signing, schedule view, and marketplace.
              </p>
            </div>
            <PreviewVideoCarousel clips={ATHLETE_CLIPS} title="Athlete experience" />
          </section>

          {/* Guardian */}
          <section className="glass-card overflow-hidden border border-[#191919]">
            <div className="p-6 pb-5 sm:p-7 sm:pb-6">
              <p className="public-kicker">Guardian</p>
              <h2 className="mt-2 text-xl font-semibold text-[#191919]">Guardian approvals</h2>
              <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">
                How parents review and approve actions for their minor athletes.
              </p>
            </div>
            <div className="flex aspect-video w-full items-center justify-center bg-[#191919]">
              <p className="text-sm text-[#6b5f55]">Video coming soon</p>
            </div>
          </section>

        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-lg font-semibold text-[#191919]">Ready to get started?</p>
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
