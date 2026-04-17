'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import LogoMark from '@/components/LogoMark'

export default function ForgotPasswordPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const emailParam = searchParams.get('email')?.trim() || ''
    if (emailParam) setEmail(emailParam)
  }, [searchParams])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-transparent">
          <LogoMark className="h-12 w-12" size={48} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#191919]">Forgot password</h1>
        <p className="mt-2 max-w-lg text-center text-sm text-[#4a4a4a]">
          Enter the email tied to your account and we&apos;ll send you a password reset link.
        </p>

        <form
          className="mt-6 w-full max-w-lg space-y-4 rounded-2xl border border-[#191919] bg-white p-6 shadow-[0_18px_50px_rgba(25,25,25,0.08)]"
          onSubmit={async (event) => {
            event.preventDefault()
            const trimmedEmail = email.trim().toLowerCase()
            setNotice(null)
            setError(null)
            if (!trimmedEmail) {
              setError('Enter the email tied to your account.')
              return
            }
            setLoading(true)
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
              redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/auth/reset`,
            })
            setLoading(false)
            if (resetError) {
              setError(resetError.message)
              return
            }
            setNotice(`Reset link sent to ${trimmedEmail}. Check your inbox.`)
          }}
        >
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#191919]">Account email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="example@gmail.com"
              className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-[#b80f0a] bg-[#fff5f5] px-3 py-2 text-xs text-[#b80f0a]">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-lg border border-[#dcdcdc] bg-[#fafafa] px-3 py-2 text-xs text-[#4a4a4a]">
              {notice}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'Sending reset link...' : 'Send reset link'}
          </button>

          <p className="text-center text-sm text-[#4a4a4a]">
            Back to{' '}
            <Link href="/login" className="font-semibold text-[#191919] underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  )
}
