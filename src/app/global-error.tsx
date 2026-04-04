'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
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
    <html lang="en">
      <body className="page-shell">
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <h1 className="text-3xl font-semibold text-[#191919]">Something went wrong.</h1>
          <p className="text-sm text-[#4a4a4a]">
            We logged this error and will look into it. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
