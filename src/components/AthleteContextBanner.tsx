'use client'

import AthleteProfileSwitcher from '@/components/AthleteProfileSwitcher'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

type AthleteContextBannerProps = {
  scope?: 'athlete' | 'account'
  className?: string
  athleteDescription?: string
  accountDescription?: string
}

export default function AthleteContextBanner({
  scope = 'athlete',
  className = '',
  athleteDescription = 'Athlete-specific data and actions stay scoped to the selected athlete.',
  accountDescription = 'This page is shared at the account level. Payments, support, and general alerts apply across the family account.',
}: AthleteContextBannerProps) {
  const { activeAthleteLabel, hasMultipleAthletes, mainAthleteLabel } = useAthleteProfile()
  const isAccountScope = scope === 'account'

  return (
    <section className={`glass-card border border-[#191919] bg-white p-4 ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">
            {isAccountScope ? 'Account context' : 'Active athlete'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#191919] bg-[#f7f6f4] px-3 py-1 text-xs font-semibold text-[#191919]">
              {activeAthleteLabel}
            </span>
            {isAccountScope ? (
              <span className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs font-semibold text-[#4a4a4a]">
                Shared account feature
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-xs text-[#4a4a4a]">
            {isAccountScope ? accountDescription : athleteDescription}
          </p>
        </div>
        {hasMultipleAthletes ? (
          <AthleteProfileSwitcher className="min-w-[190px]" mainLabel={mainAthleteLabel} />
        ) : null}
      </div>
    </section>
  )
}
