'use client'

import { useEffect, useMemo } from 'react'
import posthog from 'posthog-js'
import { createSafeClientComponentClient } from '@/lib/supabaseHelpers'

if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_POSTHOG_TOKEN &&
  !posthog.__loaded
) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_TOKEN, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',
  })
}

export default function PostHogIdentify() {
  const supabase = useMemo(() => createSafeClientComponentClient(), [])

  useEffect(() => {
    let active = true

    const identifyUser = async (user: {
      id: string
      email?: string | null
      user_metadata?: Record<string, unknown>
    } | null) => {
      if (!active) return
      if (!user?.id) {
        posthog.reset()
        return
      }

      const metadata = (user.user_metadata || {}) as Record<string, unknown>
      const role = String(metadata.role || '').trim() || null
      const fullName = String(metadata.full_name || metadata.name || '').trim() || null

      posthog.identify(user.id, {
        email: user.email || null,
        name: fullName,
        role,
      })
    }

    supabase.auth.getUser().then(({ data }) => {
      void identifyUser(data.user || null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user || null

      if (event === 'SIGNED_OUT') {
        posthog.reset()
        return
      }

      void identifyUser(user)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])

  return null
}
