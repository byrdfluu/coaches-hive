'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LogoMark from '@/components/LogoMark'

const getErrorMessage = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return 'Unable to sign in.'
  const error = (payload as { error?: unknown }).error
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return 'Unable to sign in.'
}

export default function AdminLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const callbackError = searchParams.get('error')
    if (callbackError) setError(callbackError)
  }, [searchParams])

  useEffect(() => {
    if (!retryAt) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [retryAt])

  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000))

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 py-12">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden">
          <LogoMark className="h-12 w-12" size={48} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#191919]">Superadmin sign in</h1>
        <form
          className="mt-6 w-full max-w-lg space-y-5 rounded-2xl border border-[#191919] bg-white p-6 shadow-[0_18px_50px_rgba(25,25,25,0.08)]"
          onSubmit={async (event) => {
            event.preventDefault()
            setLoading(true)
            setError(null)
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password, admin_only: true }),
            }).catch(() => null)
            const payload = await response?.json().catch(() => null)
            if (!response?.ok || !payload?.user) {
              setError(getErrorMessage(payload))
              if (response?.status === 429) {
                const seconds = Number(payload?.retry_after || response.headers.get('Retry-After') || 300)
                setNow(Date.now())
                setRetryAt(Date.now() + Math.max(1, seconds) * 1000)
              }
              setLoading(false)
              return
            }
            window.location.replace('/admin')
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-semibold text-[#191919]">
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 text-sm outline-none focus:border-[#191919] focus:bg-white"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-[#191919]">
            Password
            <span className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 pr-16 text-sm outline-none focus:border-[#191919] focus:bg-white"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <button
            type="button"
            className="text-sm font-semibold text-[#b80f0a] underline"
            onClick={() => router.push(email.trim()
              ? `/auth/forgot-password?email=${encodeURIComponent(email.trim())}`
              : '/auth/forgot-password')}
          >
            Reset password
          </button>
          {error ? (
            <p className="rounded-lg border border-[#b80f0a] bg-[#fff5f5] px-3 py-2 text-sm text-[#b80f0a]">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white"
            disabled={loading || retrySeconds > 0}
          >
            {loading ? 'Signing in…' : retrySeconds > 0 ? `Try again in ${Math.ceil(retrySeconds / 60)} min` : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
