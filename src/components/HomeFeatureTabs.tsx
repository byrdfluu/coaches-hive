'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const ROTATE_MS = 4500

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function IconMessage({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function IconShoppingBag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}
function IconCreditCard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}
function IconBarChart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  )
}
function IconClipboard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" ry="1" /><path d="m9 12 2 2 4-4" />
    </svg>
  )
}
function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

const features = [
  {
    key: 'scheduling',
    label: 'Scheduling',
    title: 'Schedule practices, games, and tournaments across every team.',
    body: 'Each coach manages their team schedule. You see all practices, games, and locations across every team from one calendar. No more group chat scheduling.',
    bullets: ['Practice scheduling', 'Game & tournament dates', 'Multi-team calendar'],
    Icon: IconCalendar,
    cardBody: 'Schedule practices, games, and tournaments across every team from one calendar.',
  },
  {
    key: 'messaging',
    label: 'Messaging',
    title: 'One place for every conversation in your program.',
    body: 'Parent announcements, coach-to-athlete threads, org-wide broadcasts, and direct messages — all in one inbox. Not fifteen group chats.',
    bullets: ['Parent announcements', 'Coach threads', 'Org-wide broadcasts'],
    Icon: IconMessage,
    cardBody: 'Parent announcements, coach threads, and org-wide broadcasts in one inbox.',
  },
  {
    key: 'roster',
    label: 'Roster',
    title: 'Manage every athlete across every team in one place.',
    body: "Add athletes, assign them to teams, track compliance, and export your full roster when you need it. No more spreadsheets passed around in a group chat.",
    bullets: ['Multi-team rosters', 'Athlete profiles', 'Exportable data'],
    Icon: IconUsers,
    cardBody: 'Add athletes, assign to teams, and export your full roster in one click.',
  },
  {
    key: 'payments',
    label: 'Payments',
    title: 'Collect dues without chasing anyone.',
    body: "Create fees, assign them to teams or individual athletes, and let automated reminders do the follow-up. You see exactly who's paid and who isn't.",
    bullets: ['Dues collection', 'Fee assignments', 'Payment tracking'],
    Icon: IconCreditCard,
    cardBody: 'Create fees, assign to teams or athletes, and automate reminders.',
  },
  {
    key: 'reports',
    label: 'Reports',
    title: 'Know exactly how your program is performing.',
    body: 'Track attendance, revenue, roster size, and coach activity across every team. No spreadsheets needed.',
    bullets: ['Roster reports', 'Revenue tracking', 'Coach activity'],
    Icon: IconBarChart,
    cardBody: 'Track attendance, revenue, and coach activity across every team.',
  },
  {
    key: 'waivers',
    label: 'Waivers',
    title: 'Send digital waivers and stay compliance-ready.',
    body: 'Create waiver templates, send to athletes before the season starts, and track every signature in one place.',
    bullets: ['Digital waivers', 'Signature tracking', 'Audit-ready records'],
    Icon: IconClipboard,
    cardBody: 'Send digital waivers, track every signature, and stay audit-ready.',
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
        <h2 className="public-title mt-2">Everything you need to run a youth sports organization.</h2>
        <p className="public-copy mt-3">
          Tryout management, multi-coach coordination, dues collection, and reporting — built for directors who are done running programs out of group chats.
        </p>
      </div>

      <div className="mt-8">
        <div className="relative border-b border-[#d9d9d9]">
          <div ref={tabsRowRef} className="flex flex-wrap items-center gap-3 pb-4 sm:gap-6">
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

      <div className="mt-8 max-w-2xl">
        <h3 className="display text-4xl font-semibold leading-[1.05] text-[#1f1c18]">
          {activeFeature.title}
        </h3>
        <p className="mt-5 text-lg text-[#5a5a5a]">{activeFeature.body}</p>
        <ul className="mt-5 space-y-1 text-lg text-[#3d3d3d]">
          {activeFeature.bullets.map((bullet) => (
            <li key={bullet} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#b80f0a]" />
              {bullet}
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/signup?role=org" className="accent-button px-6 py-3">
            Get started
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-[#d2d2d2] bg-white px-5 py-2 text-sm font-semibold text-[#191919] shadow-[0_8px_22px_rgba(25,25,25,0.07)] transition hover:text-[#b80f0a]"
          >
            See pricing
          </Link>
        </div>
      </div>
    </section>
  )
}
