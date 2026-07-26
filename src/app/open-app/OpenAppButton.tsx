'use client'

import { useEffect, useMemo } from 'react'
import posthog from 'posthog-js'

export default function OpenAppButton({ destination }: { destination?: string | null }) {
  const deepLink = useMemo(() => {
    const params = new URLSearchParams()
    if (destination) params.set('path', destination)
    const query = params.toString()
    return `coacheshive://open${query ? `?${query}` : ''}`
  }, [destination])

  useEffect(() => {
    posthog.capture('app_handoff_viewed', {
      destination: destination || null,
    })
  }, [destination])

  return (
    <a
      href={deepLink}
      onClick={() => {
        posthog.capture('app_handoff_open_clicked', {
          destination: destination || null,
        })
      }}
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#b80f0a] px-8 py-3 text-base font-bold text-white transition hover:bg-[#99100c] focus:outline-none focus:ring-2 focus:ring-[#b80f0a] focus:ring-offset-2"
    >
      Open Coaches Hive
    </a>
  )
}
