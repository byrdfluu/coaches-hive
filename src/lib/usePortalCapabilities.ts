'use client'

import { useEffect, useState } from 'react'
import type { CapabilityGrant } from '@/lib/portalCapabilities'

export function usePortalCapabilities() {
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityGrant> | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    fetch('/api/capabilities', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(payload => { if (active) setCapabilities(payload?.capabilities || null) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  return { capabilities, loading, canView: (key: string) => capabilities?.[key]?.view !== false }
}
