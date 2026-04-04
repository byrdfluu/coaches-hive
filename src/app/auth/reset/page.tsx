'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import LogoMark from '@/components/LogoMark'

const RESET_PATH = '/auth/reset'

export default function ResetPasswordPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [checkingSession, setCheckingSession] = useState(true)
  const [sessionMissing, setSessionMissing] = useState(false)

  useEffect(() => {
    let isMounted = true
    const scrubRecoveryParams = () => {
      if (typeof window === 'undefined') return
      window.history.replaceState({}, document.title, RESET_PATH)
    }

    const syncSession = async () => {
      const code = searchParams.get('code')
      const tokenHash = searchParams.get('token_hash')
      const typeParam = searchParams.get('type')
      const hashParams =
        typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      let recoveryError: string | null = null
      let shouldScrubUrl = false

      if (tokenHash && typeParam === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        })
        if (error) {
          recoveryError = 'Reset link is invalid or expired. Please request a new one.'
        } else {
          shouldScrubUrl = true
        }
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          recoveryError = 'Reset link is invalid or expired. Please request a new one.'
        } else {
          shouldScrubUrl = true
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          recoveryError = 'Reset link is invalid or expired. Please request a new one.'
        } else {
          shouldScrubUrl = true
        }
      }

      const { data } = await supabase.auth.getSession()
      if (!isMounted) return

      if (shouldScrubUrl) {
        scrubRecoveryParams()
      }

      if (recoveryError) {
        setError(recoveryError)
      }
      setSessionMissing(!data.session)
      setCheckingSession(false)
    }

    void syncSession()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSessionMissing(!session)
        setCheckingSession(false)
      }
    })
    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [searchParams, supabase])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-transparent">
          <LogoMark className="h-12 w-12" size={48} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#191919]">Reset password</h1>
        <p className="mt-2 text-sm text-[#4a4a4a]">Choose a new password for your account.</p>

        <form
          className="mt-6 w-full max-w-lg space-y-4 rounded-2xl border border-[#191919] bg-white p-6 shadow-[0_18px_50px_rgba(25,25,25,0.08)]"
          onSubmit={async (event) => {
            event.preventDefault()
            setError(null)
            setNotice(null)
            if (checkingSession) {
              setError('Checking reset session. Please try again in a moment.')
              return
            }
            if (sessionMissing) {
              setError('Reset link is missing or expired. Please request a new link.')
              return
            }
            if (!password || !confirmPassword) {
              setError('Enter and confirm your new password.')
              return
            }
            if (password !== confirmPassword) {
              setError('Passwords do not match.')
              return
            }
            setLoading(true)
            const { error: updateError } = await supabase.auth.updateUser({ password })
            if (updateError) {
              setError(updateError.message)
              setLoading(false)
              return
            }
            await supabase.auth.signOut().catch(() => null)
            setNotice('Password updated. Redirecting to sign in...')
            setLoading(false)
            setCooldown(60)
            const interval = setInterval(() => {
              setCooldown((prev) => {
                if (prev <= 1) { clearInterval(interval); return 0 }
                return prev - 1
              })
            }, 1000)
            setTimeout(() => router.push('/login?reset=success'), 1200)
          }}
        >
          {!checkingSession && sessionMissing && (
            <div className="rounded-lg border border-[#f0d6d6] bg-[#fff5f5] px-3 py-2 text-xs text-[#b80f0a]">
              Reset link is missing or expired. Request a new one from the sign-in page.
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#191919]">New password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 pr-16 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#191919] transition hover:text-[#b80f0a]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#191919]">Confirm password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 pr-16 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#191919] transition hover:text-[#b80f0a]"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-[#b80f0a] bg-[#fff5f5] px-3 py-2 text-xs text-[#b80f0a]">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg border border-[#dcdcdc] bg-[#fafafa] px-3 py-2 text-xs text-[#4a4a4a]">
              {notice}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            disabled={loading || cooldown > 0 || checkingSession}
          >
            {checkingSession ? 'Checking reset link...' : loading ? 'Updating...' : cooldown > 0 ? `Wait ${cooldown}s` : 'Update password'}
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
