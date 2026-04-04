'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="public-kicker">Error</p>
        <h1 className="public-title mt-2 text-4xl md:text-5xl">Something went wrong.</h1>
        <p className="mt-3 max-w-xl text-sm text-[#4a4a4a] md:text-base">
          We logged this error. Try again or return to the homepage.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="accent-button px-5 py-2"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-[#191919] bg-white px-5 py-2 text-sm font-semibold text-[#191919] shadow-[0_8px_22px_rgba(25,25,25,0.07)] transition hover:text-[#b80f0a]"
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  )
}
