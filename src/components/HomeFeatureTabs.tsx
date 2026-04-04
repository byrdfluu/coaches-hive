'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

const ROTATE_MS = 4500

const features = [
  {
    key: 'scheduling',
    label: 'Scheduling',
    title: 'Plan once, everyone stays in sync.',
    body: 'Athletes see sessions, coaches manage availability, and orgs keep teams aligned.',
    bullets: ['Athlete schedules', 'Coach availability', 'Org-wide calendars'],
    image: '/Scheduling.png',
  },
  {
    key: 'messaging',
    label: 'Messaging',
    title: 'One inbox for athletes, coaches, and orgs.',
    body: 'Keep conversations, updates, and files in a single thread per team or athlete.',
    bullets: ['Athlete updates', 'Coach + org threads', 'File sharing'],
    image: '/platformsuite-messaging.png',
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    title: 'Programs and products for every athlete.',
    body: 'Coaches and orgs publish offerings, athletes discover and purchase in one place.',
    bullets: ['Athlete checkout', 'Coach storefronts', 'Org offerings'],
    image: '/platformsuite-marketplace.png',
  },
  {
    key: 'payments',
    label: 'Payments',
    title: 'Payments that work for everyone.',
    body: 'Athletes pay once, coaches get paid, and orgs track every fee.',
    bullets: ['Athlete payments', 'Coach payouts', 'Org reporting'],
    image: '/platformsuite-payments.png',
  },
  {
    key: 'reports',
    label: 'Reports',
    title: 'Progress and performance for all.',
    body: 'Athletes track growth, coaches review outcomes, and orgs monitor program health.',
    bullets: ['Athlete progress', 'Coach insights', 'Org dashboards'],
    image: '/platformsuite-reports.png',
  },
]

export default function HomeFeatureTabs() {
  const [activeIndex, setActiveIndex] = useState(0)
  const tabsRowRef = useRef<HTMLDivElement | null>(null)
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [indicatorStyle, setIndicatorStyle] = useState({ x: 0, width: 0 })

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % features.length)
    }, ROTATE_MS)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const updateIndicator = () => {
      const row = tabsRowRef.current
      const activeButton = tabButtonRefs.current[activeIndex]
      if (!row || !activeButton) return
      setIndicatorStyle({
        x: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      })
    }

    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [activeIndex])

  const activeFeature = features[activeIndex]

  return (
    <section className="glass-card card-hero card-accent mt-14 bg-white p-6 md:p-8">
      <div className="max-w-3xl">
        <p className="public-kicker">Platform suite</p>
        <h2 className="public-title mt-2">Built for athletes, coaches, and organizations.</h2>
        <p className="public-copy mt-3">
          Scheduling, messaging, payments, marketplace, and reports that keep every role aligned.
        </p>
      </div>

      <div className="mt-8">
        <div className="relative border-b border-[#d9d9d9]">
          <div ref={tabsRowRef} className="flex flex-wrap items-center gap-6 pb-4">
            {features.map((feature, index) => {
              const isActive = index === activeIndex
              return (
                <button
                  key={feature.key}
                  ref={(node) => {
                    tabButtonRefs.current[index] = node
                  }}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => setActiveIndex(index)}
                  className={`text-xs font-semibold uppercase tracking-[0.22em] transition ${
                    isActive ? 'text-[#b80f0a]' : 'text-[#9b9b9b]'
                  }`}
                >
                  {feature.label}
                </button>
              )
            })}
          </div>
          <div
            className="suite-tabs-indicator"
            style={{
              width: `${indicatorStyle.width}px`,
              transform: `translateX(${indicatorStyle.x}px)`,
            }}
          >
            <span key={activeFeature.key} className="suite-tabs-progress" />
          </div>
        </div>
      </div>

      <div className="mt-8 grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h3 className="display text-4xl font-semibold leading-[1.05] text-[#1f1c18]">
            {activeFeature.title}
          </h3>
          <p className="mt-5 text-lg text-[#5a5a5a]">{activeFeature.body}</p>
          <ul className="mt-5 space-y-1 text-lg text-[#3d3d3d]">
            {activeFeature.bullets.map((bullet) => (
              <li key={bullet}>• {bullet}</li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="accent-button px-6 py-3">
              Get started
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-[#d2d2d2] bg-white px-5 py-2 text-sm font-semibold text-[#191919] shadow-[0_8px_22px_rgba(25,25,25,0.07)] transition hover:text-[#b80f0a]"
            >
              Learn more
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border-[4px] border-[#b80f0a] bg-white p-2 shadow-[0_16px_38px_rgba(25,25,25,0.13)]">
          <div className="overflow-hidden rounded-2xl border border-[#e3e3e3] bg-[#f7f7f7]">
            <Image
              src={activeFeature.image}
              alt={`${activeFeature.label} preview`}
              width={1100}
              height={660}
              priority
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1100px"
              className="h-[200px] sm:h-[260px] md:h-[320px] w-full object-cover object-top"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
