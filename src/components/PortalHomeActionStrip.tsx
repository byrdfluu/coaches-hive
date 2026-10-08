'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { PortalKind } from '@/components/PortalAppShell'

type Action = { label: string; detail: string; href: string }

const actionsByPortal: Partial<Record<PortalKind, Action[]>> = {
  coach: [
    { label: 'Take attendance', detail: 'Mark today’s sessions', href: '/coach/attendance' },
    { label: 'Message an athlete', detail: 'Open your inbox', href: '/coach/messages' },
    { label: 'Create a training plan', detail: 'Build the next assignment', href: '/coach/plans' },
  ],
  family: [
    { label: 'View schedule', detail: 'See upcoming sessions', href: '/athlete/calendar' },
    { label: 'Review waivers', detail: 'Complete required paperwork', href: '/athlete/waivers' },
    { label: 'Discover coaches', detail: 'Find the right connection', href: '/athlete/discover' },
  ],
  organization: [
    { label: 'Review roster', detail: 'Enrollment and team status', href: '/org/roster-status' },
    { label: 'Check registrations', detail: 'New enrollment submissions', href: '/org/enrollment' },
    { label: 'Compliance tasks', detail: 'Handle required follow-ups', href: '/org/compliance' },
  ],
}

const onboardingPath: Partial<Record<PortalKind, string>> = {
  coach: '/coach/onboarding',
  family: '/athlete/onboarding',
  organization: '/org/onboarding',
}

export default function PortalHomeActionStrip({ portal, attentionCount }: { portal: PortalKind; attentionCount: number }) {
  const [onboardingIncomplete, setOnboardingIncomplete] = useState(false)
  const actions = actionsByPortal[portal] || []

  useEffect(() => {
    let active = true
    if (!onboardingPath[portal]) return
    fetch('/api/onboarding/profile', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active && payload) setOnboardingIncomplete(!payload.completed)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [portal])

  if (!actions.length) return null

  return (
    <section className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 lg:px-8" aria-label="Quick actions">
      {onboardingIncomplete ? (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#e4c2bf] bg-[#fff7f6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#b80f0a]">Setup in progress</p>
            <p className="mt-1 font-semibold text-[#191919]">Finish your setup when you’re ready. Your answers are saved.</p>
          </div>
          <Link href={onboardingPath[portal] || '#'} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#191919] px-5 text-sm font-bold text-white">Resume setup</Link>
        </div>
      ) : null}
      <div className="rounded-3xl border border-[#deded9] bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,.05)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#777]">Today</p><h2 className="mt-1 text-lg font-bold text-[#191919]">Start with what matters</h2></div>
          {attentionCount > 0 ? <span className="rounded-full bg-[#fff0ef] px-3 py-1 text-xs font-black text-[#b80f0a]">{attentionCount} unread</span> : <span className="text-xs font-semibold text-[#777]">All caught up</span>}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {actions.map((action) => (
            <Link key={action.href} href={action.href} className="group rounded-2xl border border-[#e5e5e1] bg-[#fafaf8] px-4 py-3 transition hover:border-[#b80f0a] hover:bg-white">
              <span className="flex items-center justify-between font-bold text-[#191919]"><span>{action.label}</span><span className="text-[#b80f0a] transition group-hover:translate-x-1">→</span></span>
              <span className="mt-1 block text-sm text-[#666]">{action.detail}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
