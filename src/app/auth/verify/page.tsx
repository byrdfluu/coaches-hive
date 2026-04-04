'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier } from '@/lib/planRules'
import LogoMark from '@/components/LogoMark'

type VerifyOtpType = 'email' | 'magiclink' | 'signup'

const resolveCodeLength = (value: string | null | undefined) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return 6
  if (parsed < 4 || parsed > 10) return 6
  return parsed
}

export default function VerifyEmailPage() {
  const supabaseRef = useRef(createClientComponentClient())
  const supabase = supabaseRef.current
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [expectedCodeLength, setExpectedCodeLength] = useState(6)
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const [sendingCode, setSendingCode] = useState(false)

  const query = useMemo(() => {
    if (typeof window === 'undefined') {
      return { role: null, tier: null, email: null, codeLength: 6 }
    }
    const params = new URLSearchParams(window.location.search)
    const storedRole = window.localStorage.getItem('pending_verification_role')?.trim() || null
    const storedTier = window.localStorage.getItem('pending_verification_tier')?.trim() || null
    const storedEmail = window.localStorage.getItem('pending_verification_email')?.trim() || null
    const storedCodeLength = window.localStorage.getItem('pending_verification_code_length')?.trim() || null
    return {
      role: params.get('role') || storedRole,
      tier: params.get('tier') || storedTier,
      email: params.get('email') || storedEmail,
      sent: params.get('sent') === '1',
      codeLength: resolveCodeLength(params.get('code_length') || storedCodeLength),
    }
  }, [])

  const buildPlanPath = (role?: string | null, tier?: string | null) => {
    if (role === 'guardian') return '/guardian/dashboard'
    if (role !== 'coach' && role !== 'athlete' && role !== 'org_admin') return '/select-plan'
    let resolvedTier = (tier || '').trim()
    if (role === 'coach') resolvedTier = normalizeCoachTier(resolvedTier || undefined)
    if (role === 'athlete') resolvedTier = normalizeAthleteTier(resolvedTier || undefined)
    if (role === 'org_admin') resolvedTier = normalizeOrgTier(resolvedTier || undefined)
    return `/select-plan?role=${role}${resolvedTier ? `&tier=${encodeURIComponent(resolvedTier)}` : ''}`
  }

  const resolveEmail = useCallback(() => {
    const fromState = email.trim()
    if (fromState) return fromState
    const fromQuery = query.email?.trim()
    if (fromQuery) return fromQuery
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('pending_verification_email')?.trim() || ''
  }, [email, query.email])

  const emitVerificationEvent = useCallback(async () => {
    const response = await fetch('/api/lifecycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'verification_confirmed',
        tier: query.tier || null,
      }),
    }).catch(() => null)
    return response?.ok ?? false
  }, [query.tier])

  const persistVerificationLifecycle = useCallback(
    async (
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null,
    ) => {
      if (!session?.user) return false
      const roleFromSession = String(session.user.user_metadata?.role || '').trim()
      const roleFromQuery = String(query.role || '').trim()
      const role = roleFromQuery || roleFromSession
      const tierFromSession = String(session.user.user_metadata?.selected_tier || '').trim()
      const tierFromQuery = String(query.tier || '').trim()
      const selectedTier = tierFromQuery || tierFromSession || null

      const payload: Record<string, string> = {
        lifecycle_state: 'verified_pending_plan',
        lifecycle_updated_at: new Date().toISOString(),
      }
      if (role === 'coach' || role === 'athlete' || role === 'org_admin') payload.role = role
      if (selectedTier) payload.selected_tier = selectedTier

      const { error } = await supabase.auth.updateUser({ data: payload })
      return !error
    },
    [query.role, query.tier, supabase],
  )

  const waitForServerSession = useCallback(async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch('/api/lifecycle', { cache: 'no-store' }).catch(() => null)
      if (response?.ok) {
        const payload = await response.json().catch(() => null)
        return payload?.snapshot || null
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return null
  }, [])

  const redirectToPlan = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const snapshot = await waitForServerSession()
    const snapshotPath = String(snapshot?.nextPath || '')
    if (snapshotPath.startsWith('/select-plan')) {
      window.location.replace(snapshotPath)
      return
    }
    const sessionRole = session?.user?.user_metadata?.role as string | undefined
    const sessionTier = session?.user?.user_metadata?.selected_tier as string | undefined
    const destination = buildPlanPath(query.role || sessionRole || null, query.tier || sessionTier || null)
    // Hard navigation so the browser sends freshly-set session cookies to the
    // middleware instead of a cached client-side session that may still carry
    // the pre-verification lifecycle state.
    window.location.replace(destination)
  }, [query.role, query.tier, supabase.auth, waitForServerSession])

  const sendVerificationCode = useCallback(async (targetEmailOverride?: string) => {
    setNotice(null)
    const targetEmail = (targetEmailOverride || resolveEmail()).toLowerCase()
    if (!targetEmail) {
      setNotice('Enter your account email first.')
      return
    }

    setSendingCode(true)
    const response = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: targetEmail,
        role: query.role || undefined,
        tier: query.tier || undefined,
      }),
    })
    const payload = await response.json().catch(() => null)
    setSendingCode(false)

    if (!response.ok) {
      setStatus('error')
      setNotice(payload?.error || 'Unable to send verification code.')
      return
    }

    const codeLength = resolveCodeLength(String(payload?.code_length || ''))
    setExpectedCodeLength(codeLength)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('pending_verification_email', targetEmail)
      window.localStorage.setItem('pending_verification_code_length', String(codeLength))
    }
    setEmail(targetEmail)
    setStatus('idle')
    setNotice(`Verification code sent to ${targetEmail}.`)
  }, [resolveEmail, query.role, query.tier])

  const verifyWithCode = async () => {
    setNotice(null)
    const targetEmail = resolveEmail().toLowerCase()
    if (!targetEmail) {
      setNotice('Enter your account email first.')
      return
    }
    const trimmedCode = code.trim()
    if (trimmedCode.length !== expectedCodeLength) {
      setNotice(`Enter the ${expectedCodeLength}-digit verification code from your email.`)
      return
    }

    setStatus('verifying')
    const verifyTypes: VerifyOtpType[] = ['magiclink', 'signup', 'email']
    let verifiedSession = null as Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null
    let lastError: string | null = null
    for (const verifyType of verifyTypes) {
      const { data, error } = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: trimmedCode,
        type: verifyType,
      })
      if (error) {
        lastError = error.message
        continue
      }
      // Token verified — stop trying other types immediately.
      // The token is now consumed; continuing the loop with a different type
      // would cause Supabase to return "Token has expired or invalid".
      verifiedSession = data?.session || null
      if (!verifiedSession) {
        const {
          data: { session: nextSession },
        } = await supabase.auth.getSession()
        verifiedSession = nextSession || null
      }
      break
    }

    if (!verifiedSession) {
      await supabase.auth.refreshSession().catch(() => null)
      const {
        data: { session: nextSession },
      } = await supabase.auth.getSession()
      verifiedSession = nextSession || null
    }

    if (!verifiedSession) {
      setStatus('error')
      setNotice(lastError || 'Unable to verify code or start session. Request a new code and try again.')
      return
    }

    // Best-effort lifecycle update — middleware has a safety valve that promotes
    // awaiting_verification → verified_pending_plan when emailConfirmed=true in JWT,
    // so we never hard-block the redirect on this call.
    await persistVerificationLifecycle(verifiedSession).catch(() => null)
    await emitVerificationEvent().catch(() => null)

    await supabase.auth.refreshSession().catch(() => null)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('pending_verification_email')
      window.localStorage.removeItem('pending_verification_role')
      window.localStorage.removeItem('pending_verification_tier')
      window.localStorage.removeItem('pending_verification_code_length')
    }
    setStatus('verified')
    await redirectToPlan()
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (query.role) {
        window.localStorage.setItem('pending_verification_role', query.role)
      }
      if (query.tier) {
        window.localStorage.setItem('pending_verification_tier', query.tier)
      }
      window.localStorage.setItem('pending_verification_code_length', String(query.codeLength))
    }
    setExpectedCodeLength(query.codeLength)
    if (email.trim()) return
    const fromQuery = query.email?.trim()
    if (fromQuery) {
      setEmail(fromQuery)
      if (query.sent) {
        setStatus('idle')
        setNotice(`We sent a verification code to ${fromQuery.toLowerCase()}.`)
      }
      return
    }
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('pending_verification_email')?.trim()
    if (stored) {
      setEmail(stored)
      if (query.sent) {
        setStatus('idle')
        setNotice(`We sent a verification code to ${stored.toLowerCase()}.`)
      }
    }
  }, [email, query.codeLength, query.email, query.role, query.sent, query.tier])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 py-12">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden">
          <LogoMark className="h-12 w-12" size={48} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#191919]">Verify email</h1>
        <p className="mt-2 text-sm text-[#4a4a4a]">Enter the verification code from your email to activate your account.</p>

        <section className="mt-6 w-full max-w-lg space-y-4 rounded-2xl border border-[#191919] bg-white p-6 shadow-[0_18px_50px_rgba(25,25,25,0.08)]">
          <div className="rounded-xl border border-[#dcdcdc] bg-[#fafafa] p-3">
            <label className="text-xs text-[#4a4a4a]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@domain.com"
              className="mt-2 w-full rounded-lg border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
            />

            <label className="mt-3 block text-xs text-[#4a4a4a]">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={expectedCodeLength}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, expectedCodeLength))}
              placeholder={expectedCodeLength === 8 ? '12345678' : '123456'}
              className="mt-2 w-full rounded-lg border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
            />

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => sendVerificationCode()}
                disabled={sendingCode}
                className="w-full rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-sm font-semibold text-[#191919] transition hover:bg-[#ececec] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-[180px]"
              >
                {sendingCode ? 'Sending code...' : 'Send verification code'}
              </button>
              <button
                type="button"
                onClick={verifyWithCode}
                disabled={status === 'verifying'}
                className="w-full rounded-full bg-[#b80f0a] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#9f0d08] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-[140px]"
              >
                {status === 'verifying' ? 'Verifying...' : 'Verify code'}
              </button>
            </div>
          </div>

          {notice ? (
            <p
              className={`rounded-lg px-3 py-2 text-xs ${
                status === 'error'
                  ? 'border border-[#b80f0a] bg-[#fff5f5] text-[#b80f0a]'
                  : 'border border-[#dcdcdc] bg-[#fafafa] text-[#4a4a4a]'
              }`}
            >
              {notice}
            </p>
          ) : null}

          {status === 'verified' ? (
            <Link
              href="/login"
              className="block w-full rounded-full border border-[#dcdcdc] bg-white px-4 py-3 text-center text-sm font-semibold text-[#191919] shadow-[0_6px_18px_rgba(25,25,25,0.06)] transition hover:bg-[#f5f5f5]"
            >
              Go to sign in
            </Link>
          ) : null}
        </section>
      </div>
    </main>
  )
}
