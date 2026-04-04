'use client'

import { useEffect } from 'react'
import mixpanel from 'mixpanel-browser'

let mixpanelInitialized = false

export default function MixpanelProvider() {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN

    if (!token || mixpanelInitialized) {
      return
    }

    mixpanel.init(token, {
      autocapture: true,
      record_sessions_percent: 100,
    })

    mixpanelInitialized = true
  }, [])

  return null
}
