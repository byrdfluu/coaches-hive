'use client'

import { useEffect, useState } from 'react'

const resolveAppStoreUrl = () => {
  const value = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !['apps.apple.com', 'testflight.apple.com'].includes(url.hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

const APP_STORE_URL = resolveAppStoreUrl()

export default function DeviceAwareRegistrationLink({
  webHref,
  label,
  className,
  style,
}: {
  webHref: string
  label: string
  className?: string
  style?: React.CSSProperties
}) {
  const [href, setHref] = useState(webHref)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '')
    setIsIos(ios)
    if (ios && APP_STORE_URL) setHref(APP_STORE_URL)
  }, [])

  return (
    <a href={href} className={className} style={style}>
      {isIos ? 'Download the app to register' : label}
    </a>
  )
}
