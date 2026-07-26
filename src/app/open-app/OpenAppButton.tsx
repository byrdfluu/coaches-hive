'use client'

import { useEffect, useState } from 'react'
import posthog from 'posthog-js'
import { resolveWebPortalPath } from '@/lib/webPortalRouting'

export default function OpenAppButton({ destination }: { destination?: string | null }) {
  const [portalHref, setPortalHref] = useState('/login?next=/open-app')

  useEffect(() => {
    posthog.capture('app_handoff_viewed', {
      destination: destination || null,
    })
    let active = true
    void fetch('/api/roles/available', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<{
          active_role?: string | null
          base_role?: string | null
          roles?: string[]
        }>
      })
      .then((payload) => {
        if (!active || !payload) return
        const portalPath = resolveWebPortalPath({
          activeRole: payload.active_role,
          baseRole: payload.base_role,
          roles: payload.roles,
        })
        if (portalPath) setPortalHref(`${portalPath}?web=1`)
      })
      .catch(() => null)
    return () => {
      active = false
    }
  }, [destination])

  return (
    <a
      href={portalHref}
      onClick={() => {
        document.cookie = 'ch_web_portal=1; Path=/; Max-Age=2592000; SameSite=Lax'
        posthog.capture('web_portal_open_clicked', {
          destination: destination || null,
          portal_href: portalHref,
        })
      }}
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#b80f0a] px-8 py-3 text-base font-bold text-white transition hover:bg-[#99100c] focus:outline-none focus:ring-2 focus:ring-[#b80f0a] focus:ring-offset-2"
    >
      Open Coaches Hive
    </a>
  )
}
