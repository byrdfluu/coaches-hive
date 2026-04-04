'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { resolvePreferredSignInRole, roleToPath } from '@/lib/roleRedirect'
import LogoMark from '@/components/LogoMark'

const safeNextPath = (value: string | null) => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}

const resolveRequestedRole = (roleParam: string | null, nextPath: string | null) => {
  if (roleParam === 'coach' || roleParam === 'athlete') return roleParam
  if (nextPath === '/coach/dashboard' || nextPath?.startsWith('/coach/')) return 'coach'
  if (nextPath === '/athlete/dashboard' || nextPath?.startsWith('/athlete/')) return 'athlete'
  return null
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const remember = window.localStorage.getItem('ch_remember_me')
    if (remember === '0') setRememberMe(false)
  }, [])

  useEffect(() => {
    const callbackError = searchParams.get('error')
    if (callbackError) setError(callbackError)
    const resetStatus = searchParams.get('reset')
    if (resetStatus === 'success') setNotice('Password updated. Sign in with your new password.')
  }, [searchParams])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 py-12">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden">
          <LogoMark className="h-12 w-12" size={48} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#191919]">
          Welcome Back!
        </h1>

        <form
          className="mt-6 w-full max-w-lg space-y-5 rounded-2xl border border-[#191919] bg-white p-6 shadow-[0_18px_50px_rgba(25,25,25,0.08)]"
          onSubmit={async (e) => {
            e.preventDefault()
            setLoading(true)
            setError(null)
            setNotice(null)
            // Set remember-me flag BEFORE auth so it's in place when tokens are stored
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('ch_remember_me', rememberMe ? '1' : '0')
              if (!rememberMe) {
                window.sessionStorage.setItem('ch_auth_session', '1')
              }
            }
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            })
            if (signInError) {
              setError(signInError.message)
              setLoading(false)
              return
            }
            const role = data.user?.user_metadata?.role as string | undefined
            const profileName = (data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || data.user?.email || '').trim()
            const avatarUrl = data.user?.user_metadata?.avatar_url || data.user?.user_metadata?.picture || null
            if (data.user?.id) {
              await supabase.from('profiles').upsert({
                id: data.user.id,
                full_name: profileName || null,
                ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
              })
            }
            if (profileName && typeof window !== 'undefined') {
              window.localStorage.setItem('ch_full_name', profileName)
              window.dispatchEvent(new CustomEvent('ch:name-updated', { detail: { name: profileName } }))
            }
            if (avatarUrl && typeof window !== 'undefined') {
              window.localStorage.setItem('ch_avatar_url', avatarUrl)
              window.dispatchEvent(new CustomEvent('ch:avatar-updated', { detail: { url: avatarUrl } }))
            }
            const requestedNextPath = safeNextPath(searchParams.get('next'))
            const requestedRole = resolveRequestedRole(searchParams.get('role'), requestedNextPath)
            const metadataRoles = Array.isArray(data.user?.user_metadata?.roles)
              ? data.user.user_metadata.roles.map((value) => String(value || '').trim()).filter(Boolean)
              : []
            const activeRole = String(data.user?.user_metadata?.active_role || '').trim() || null
            const allowedRoles = new Set<string>([
              String(data.user?.user_metadata?.role || '').trim(),
              String(activeRole || '').trim(),
              ...metadataRoles,
            ].filter(Boolean))
            const hasExplicitPortalIntent = Boolean(requestedRole || requestedNextPath)
            const defaultSignInRole = !hasExplicitPortalIntent
              ? resolvePreferredSignInRole({
                  baseRole: role || null,
                  activeRole,
                  roles: metadataRoles,
                })
              : null
            const roleToActivate = requestedRole || defaultSignInRole

            const ensureActiveRole = async (targetRole: string) => {
              const response = await fetch('/api/roles/active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: targetRole }),
              }).catch(() => null)

              if (!response?.ok) {
                const payload = await response?.json().catch(() => null)
                throw new Error(payload?.error || 'Unable to activate the requested portal role.')
              }

              const refreshed = await supabase.auth.refreshSession().catch(() => null)
              const refreshedSession = refreshed?.data?.session || null
              const refreshedActiveRole = String(refreshedSession?.user.user_metadata?.active_role || '').trim()

              if (refreshedActiveRole !== targetRole) {
                throw new Error('Sign-in completed, but the requested portal role was not activated.')
              }
            }

            if (requestedRole && allowedRoles.has(requestedRole)) {
              if (requestedRole !== activeRole) {
                try {
                  await ensureActiveRole(requestedRole)
                } catch (activationError) {
                  setError(activationError instanceof Error ? activationError.message : 'Unable to open the requested portal.')
                  setLoading(false)
                  return
                }
              }
              const lifecycleResponse = await fetch('/api/lifecycle', { cache: 'no-store' })
              setLoading(false)
              if (lifecycleResponse.ok) {
                const lifecyclePayload = await lifecycleResponse.json().catch(() => null)
                const nextPath = lifecyclePayload?.snapshot?.nextPath as string | undefined
                await supabase.auth.refreshSession().catch(() => null)
                window.location.replace(nextPath || requestedNextPath || roleToPath(requestedRole))
                return
              }
              await supabase.auth.refreshSession().catch(() => null)
              window.location.replace(requestedNextPath || roleToPath(requestedRole))
              return
            }

            if (roleToActivate && allowedRoles.has(roleToActivate) && roleToActivate !== activeRole) {
              try {
                await ensureActiveRole(roleToActivate)
              } catch (activationError) {
                setError(activationError instanceof Error ? activationError.message : 'Unable to finish sign in.')
                setLoading(false)
                return
              }
            }

            const lifecycleResponse = await fetch('/api/lifecycle', { cache: 'no-store' })
            setLoading(false)
            if (lifecycleResponse.ok) {
              const lifecyclePayload = await lifecycleResponse.json().catch(() => null)
              const nextPath = lifecyclePayload?.snapshot?.nextPath as string | undefined
              await supabase.auth.refreshSession().catch(() => null)
              window.location.replace(nextPath || roleToPath(defaultSignInRole || role))
              return
            }
            await supabase.auth.refreshSession().catch(() => null)
            window.location.replace(roleToPath(defaultSignInRole || role))
          }}
        >
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#191919]">
              Email Address
            </label>
            <input
              type="email"
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm font-semibold text-[#191919]">
              <label>Password</label>
              <button
                type="button"
                className="text-xs text-[#b80f0a] underline"
                onClick={() => {
                  const next = email.trim()
                    ? `/auth/forgot-password?email=${encodeURIComponent(email.trim())}`
                    : '/auth/forgot-password'
                  router.push(next)
                }}
              >
                Reset Password?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          <div className="space-y-3 text-sm text-[#191919]">
            <label className="flex items-center gap-2 text-sm text-[#4a4a4a]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#b80f0a]"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              Remember me
            </label>
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
          </div>

          <button
            type="submit"
            className="mt-1 w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#b80f0a]"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>

          <p className="text-center text-sm text-[#4a4a4a]">
            Don’t have an account yet?{' '}
            <Link href="/signup" className="font-semibold text-[#191919] underline">
              New Account
            </Link>
          </p>
        </form>
      </div>
    </main>
  )
}
