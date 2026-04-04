'use client'

import Link from 'next/link'

export default function OrgSuspendedPage() {
  return (
    <main className="page-shell">
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Access suspended</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#191919]">Your org access has been paused</h1>
        <p className="mt-3 text-sm text-[#4a4a4a]">
          Please contact your organization admin to restore access.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm font-semibold">
          <Link
            href="/login"
            className="rounded-full border border-[#191919] px-4 py-2 text-[#191919]"
          >
            Back to login
          </Link>
        </div>
      </div>
    </main>
  )
}
