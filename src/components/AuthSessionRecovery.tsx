'use client'

import { useEffect } from 'react'
import {
  clearSupabaseBrowserSessionArtifacts,
  isInvalidJwtSessionError,
  isSupabaseBrowserAuthLockError,
  isTransientSupabaseAuthNetworkError,
  recoverFromInvalidBrowserSession,
} from '@/lib/authSessionRecovery'

const isSignedMobileHandoffPath = () => {
  const pathname = window.location.pathname
  return pathname === '/onboarding/checkout'
    || pathname === '/pay'
    || pathname === '/marketplace/checkout'
    || pathname === '/payment/complete'
}

export default function AuthSessionRecovery() {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isTransientSupabaseAuthNetworkError(event.reason)) {
        event.preventDefault()
        return
      }
      if (isSupabaseBrowserAuthLockError(event.reason)) {
        event.preventDefault()
        return
      }
      if (!isInvalidJwtSessionError(event.reason)) return
      event.preventDefault()
      // Mobile payment relays authenticate with a signed, short-lived handoff
      // token. A stale browser Supabase cookie must not redirect a valid
      // handoff to web login; clear the unrelated cookie and let the signed
      // token flow continue.
      if (isSignedMobileHandoffPath()) {
        clearSupabaseBrowserSessionArtifacts()
        window.dispatchEvent(new CustomEvent('ch:auth-session-recovered'))
        return
      }
      void recoverFromInvalidBrowserSession()
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
