'use client'

import { usePathname } from 'next/navigation'
import AthleteProfileSwitcher from '@/components/AthleteProfileSwitcher'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

type Role = 'coach' | 'athlete' | 'admin' | 'guardian'

// Referral capture is disabled until incentives are implemented.
// When ready, restore the captureReferral useEffect that reads
// user_metadata.ref_code / localStorage ch_ref_code and POSTs to /api/referrals.

export default function RoleInfoBanner({ role: _role }: { role: Role }) {
  const pathname = usePathname()
  const { activeAthleteLabel, hasMultipleAthletes, mainAthleteLabel } = useAthleteProfile()

  if (_role === 'athlete') {
    const isAccountScope = Boolean(
      pathname
      && (
        pathname === '/athlete/payments'
        || pathname === '/athlete/support'
        || pathname === '/athlete/notifications'
        || pathname === '/athlete/settings'
      ),
    )

    return (
      <section className="glass-card border border-[#191919] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">
              {isAccountScope ? 'Account context' : 'Active athlete'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#191919] bg-[#f7f6f4] px-3 py-1 text-sm font-semibold text-[#191919]">
                {activeAthleteLabel}
              </span>
              {isAccountScope ? (
                <span className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs font-semibold text-[#4a4a4a]">
                  Shared family account
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-[#4a4a4a]">
              {isAccountScope
                ? `Payments, support, notifications, and family management stay shared across the account. Your active athlete selection remains ${activeAthleteLabel} for athlete-specific pages.`
                : `Calendar, bookings, messages, marketplace activity, and coach actions are currently scoped to ${activeAthleteLabel}.`}
            </p>
          </div>
          {hasMultipleAthletes ? (
            <AthleteProfileSwitcher className="w-full sm:w-auto sm:min-w-[220px] sm:justify-end" mainLabel={mainAthleteLabel} />
          ) : null}
        </div>
      </section>
    )
  }

  return null
}
