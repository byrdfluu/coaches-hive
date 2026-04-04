'use client'

import { useEffect } from 'react'
import { isInvalidJwtSessionError, recoverFromInvalidBrowserSession } from '@/lib/authSessionRecovery'

export default function AuthSessionRecovery() {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isInvalidJwtSessionError(event.reason)) return
      event.preventDefault()
      void recoverFromInvalidBrowserSession()
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
