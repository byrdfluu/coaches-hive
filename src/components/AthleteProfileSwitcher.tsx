'use client'

import { useAthleteProfile } from '@/components/AthleteProfileContext'

type Props = {
  className?: string
  mainLabel?: string
}

export default function AthleteProfileSwitcher({ className = '', mainLabel = 'Main account' }: Props) {
  const { subProfiles, activeSubProfileId, setActiveSubProfileId } = useAthleteProfile()

  if (subProfiles.length === 0) return null

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs font-semibold text-[#4a4a4a]">Viewing:</span>
      <select
        value={activeSubProfileId ?? ''}
        onChange={(e) => setActiveSubProfileId(e.target.value || null)}
        className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1.5 text-sm font-semibold text-[#191919] focus:border-[#191919] focus:outline-none"
      >
        <option value="">{mainLabel}</option>
        {subProfiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}