import Link from 'next/link'
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
  league: [
    { label: 'Review registrations', detail: 'Resolve incomplete entries', href: '/league/registrations' },
    { label: 'Check the schedule', detail: 'Find conflicts and missing results', href: '/league/schedule' },
    { label: 'Review compliance', detail: 'Open document submissions', href: '/league/submissions' },
  ],
  admin: [
    { label: 'Open attention queue', detail: 'Review platform operations', href: '/admin/control-center' },
    { label: 'Reconcile billing', detail: 'Inspect failures and mismatches', href: '/admin/billing-failures' },
    { label: 'Search users', detail: 'Restore or inspect an account', href: '/admin/users' },
  ],
}

export default function PortalHomeActionStrip({ portal, attentionCount }: { portal: PortalKind; attentionCount: number }) {
  const actions = actionsByPortal[portal] || []

  if (!actions.length || attentionCount === 0) return null

  return (
    <section className="mt-5" aria-label="Quick actions">
      <div className="rounded-3xl border border-[#deded9] bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,.05)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <div><p className="text-xs font-bold text-[#777]">Today</p><h2 className="mt-1 text-lg font-bold text-[#191919]">Start with what matters</h2></div>
          <span className="ch-status ch-status-attention">{attentionCount} need attention</span>
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
