'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function StripeConnectComplete() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const role = searchParams.get('role') || ''
    const orgId = searchParams.get('org_id') || ''

    const params = new URLSearchParams()
    if (role) params.set('role', role)
    if (orgId) params.set('org_id', orgId)

    const deepLink = `coacheshive://connect-updated?${params.toString()}`
    window.location.assign(deepLink)
  }, [searchParams])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f6f4] px-6 text-center">
      <p className="text-lg font-semibold text-[#191919]">Stripe setup complete.</p>
      <p className="mt-2 text-sm text-[#6b6b6b]">Returning you to the app…</p>
    </main>
  )
}
