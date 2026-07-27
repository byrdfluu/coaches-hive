'use client'

import { useEffect, useMemo, useState } from 'react'
import posthog from 'posthog-js'

type DeviceKind = 'ios' | 'android' | 'desktop'

const detectDevice = (): DeviceKind => {
  const userAgent = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  return 'desktop'
}

export default function OpenAppButton({
  destination,
  appStoreUrl,
}: {
  destination?: string | null
  appStoreUrl?: string | null
}) {
  const [device, setDevice] = useState<DeviceKind>('desktop')
  const [openFailed, setOpenFailed] = useState(false)
  const deepLink = useMemo(() => {
    const params = new URLSearchParams()
    if (destination) params.set('path', destination)
    const query = params.toString()
    return `coacheshive://open${query ? `?${query}` : ''}`
  }, [destination])

  useEffect(() => {
    setDevice(detectDevice())
    document.cookie = 'ch_web_portal=; Path=/; Max-Age=0; SameSite=Lax'
    posthog.capture('app_handoff_viewed', {
      destination: destination || null,
    })
  }, [destination])

  if (device === 'android') {
    return (
      <p className="max-w-sm rounded-2xl border border-[#d9d9d9] bg-[#f7f6f4] px-5 py-3 text-sm text-[#4a4a4a]">
        Coaches Hive is currently available for iPhone. Use the App Store link on an Apple device.
      </p>
    )
  }

  const openNativeApp = () => {
    setOpenFailed(false)
    posthog.capture('app_handoff_open_clicked', {
      destination: destination || null,
      device,
    })
    window.location.assign(deepLink)
    window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return
      if (appStoreUrl) {
        window.location.assign(appStoreUrl)
        return
      }
      setOpenFailed(true)
    }, 1400)
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={openNativeApp}
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#b80f0a] px-8 py-3 text-base font-bold text-white transition hover:bg-[#99100c] focus:outline-none focus:ring-2 focus:ring-[#b80f0a] focus:ring-offset-2"
      >
        Open Coaches Hive
      </button>
      {openFailed ? (
        <p className="mt-2 max-w-xs text-sm text-[#6b6b6b]" role="status">
          Coaches Hive could not be opened on this device. Choose Get the app.
        </p>
      ) : null}
    </div>
  )
}
