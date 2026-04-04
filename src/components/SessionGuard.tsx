'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSafeClientComponentClient } from '@/lib/supabaseHelpers'

export default function SessionGuard() {
  const router = useRouter()
  const supabase = createSafeClientComponentClient()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const remember = window.localStorage.getItem('ch_remember_me')
    if (remember !== '0') return
    const sessionActive = window.sessionStorage.getItem('ch_auth_session')
    if (sessionActive) return
    // Use onAuthStateChange so we fire after Supabase finishes restoring the session,
    // avoiding the race condition where getSession() returns null too early.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
        supabase.auth.signOut().then(() => router.replace('/login'))
      }
    })
    return () => subscription.unsubscribe()
  }, [supabase, router])

  return null
}
