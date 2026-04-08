'use client'

import { useEffect, useMemo, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import mixpanel from 'mixpanel-browser'
import { createSafeClientComponentClient } from '@/lib/supabaseHelpers'

let mixpanelInitialized = false

export default function MixpanelProvider() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createSafeClientComponentClient(), [])
  const lastTrackedUrlRef = useRef('')

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN

    if (!token || mixpanelInitialized) {
      return
    }

    mixpanel.init(token, {
      autocapture: true,
      record_sessions_percent: 100,
      track_pageview: false,
      persistence: 'localStorage',
    })

    mixpanelInitialized = true
  }, [])

  useEffect(() => {
    if (!mixpanelInitialized || !pathname) return

    const search = searchParams?.toString() || ''
    const url = `${pathname}${search ? `?${search}` : ''}`
    if (lastTrackedUrlRef.current === url) return
    lastTrackedUrlRef.current = url

    mixpanel.track('Page Viewed', {
      path: pathname,
      search: search || null,
      url,
      title: typeof document !== 'undefined' ? document.title || null : null,
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
    })
  }, [pathname, searchParams])

  useEffect(() => {
    if (!mixpanelInitialized) return

    let active = true

    const syncUser = async (userOverride?: {
      id: string
      email?: string | null
      created_at?: string | null
      user_metadata?: Record<string, unknown>
    } | null) => {
      const user = userOverride ?? (await supabase.auth.getUser()).data.user
      if (!active) return

      if (!user?.id) {
        mixpanel.reset()
        return
      }

      const metadata = (user.user_metadata || {}) as Record<string, unknown>
      const role = String(metadata.role || '').trim() || null
      const activeRole = String(metadata.active_role || '').trim() || null
      const fullName = String(metadata.full_name || metadata.name || '').trim() || null

      mixpanel.identify(user.id)
      mixpanel.register({
        user_id: user.id,
        role,
        active_role: activeRole,
      })
      mixpanel.people.set({
        $email: user.email || null,
        $name: fullName,
        role,
        active_role: activeRole,
        created_at: user.created_at || null,
      })
    }

    void syncUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user || null

      if (event === 'SIGNED_OUT') {
        mixpanel.track('Signed Out', { path: pathname || '/' })
        mixpanel.reset()
        return
      }

      if (event === 'SIGNED_IN' && user?.id) {
        const metadata = (user.user_metadata || {}) as Record<string, unknown>
        mixpanel.track('Signed In', {
          role: String(metadata.role || '').trim() || null,
          active_role: String(metadata.active_role || '').trim() || null,
        })
      }

      void syncUser(user)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [pathname, supabase])

  return null
}
