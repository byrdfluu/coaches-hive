'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LogoMark from '@/components/LogoMark'

const ownerDestinations = new Set([
  '/workspace',
  '/coach/dashboard',
  '/org',
  '/athlete/dashboard',
  '/admin',
])

export default function OwnerLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const requestedDestination = searchParams.get('next') || ''
  const destination = ownerDestinations.has(requestedDestination)
    ? requestedDestination
    : '/workspace'

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 py-12">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden">
          <LogoMark className="h-12 w-12" size={48} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#191919]">Owner web sign in</h1>
        <p className="mt-2 text-center text-sm text-[#666]">Restricted Coaches Hive owner access</p>
        <form
          className="mt-6 w-full max-w-lg space-y-5 rounded-2xl border border-[#191919] bg-white p-6 shadow-[0_18px_50px_rgba(25,25,25,0.08)]"
          onSubmit={async (event) => {
            event.preventDefault()
            setLoading(true)
            setError(null)
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password, protected_owner_only: true }),
            }).catch(() => null)
            const payload = await response?.json().catch(() => null)
            if (!response?.ok || !payload?.user) {
              setError(payload?.error || 'Unable to sign in.')
              setLoading(false)
              return
            }
            // SessionGuard supports session-only sign-ins when "remember me"
            // was disabled previously. Mark this explicitly before navigation
            // so it does not immediately sign the protected owner back out.
            window.sessionStorage.setItem('ch_auth_session', '1')
            window.localStorage.setItem('ch_remember_me', '1')
            window.location.replace(destination)
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
            className="w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
