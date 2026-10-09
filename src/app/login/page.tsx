'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import LogoMark from '@/components/LogoMark'

const safeReturnPath = (value: string | null) => {
  const candidate = String(value || '').trim()
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/'
}
const errorMessage = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return 'Unable to sign in.'
  const error = (payload as { error?: unknown }).error
  return typeof error === 'string' && error.trim() ? error : 'Unable to sign in.'
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const destination = safeReturnPath(searchParams.get('next') || searchParams.get('from'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(() => searchParams.get('error'))
  const [loading, setLoading] = useState(false)

  return <main className="page-shell"><div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 py-12">
    <LogoMark className="h-12 w-12" size={48} />
    <h1 className="mt-4 text-2xl font-semibold text-[#191919]">Sign in to Coaches Hive</h1>
    <p className="mt-2 text-center text-sm text-neutral-600">Access your organization, coach, athlete, parent, or league workspace.</p>
    <form className="mt-6 w-full max-w-lg space-y-5 rounded-2xl border border-[#191919] bg-white p-6 shadow-[0_18px_50px_rgba(25,25,25,0.08)]" onSubmit={async event => {
      event.preventDefault(); setLoading(true); setError(null)
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).catch(() => null)
      const payload = await response?.json().catch(() => null)
      if (!response?.ok || !payload?.user) { setError(errorMessage(payload)); setLoading(false); return }
      window.location.replace(destination)
    }}>
      <label className="flex flex-col gap-2 text-sm font-semibold text-[#191919]">Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 text-sm outline-none focus:border-[#191919] focus:bg-white" required /></label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-[#191919]">Password<span className="relative"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 pr-16 text-sm outline-none focus:border-[#191919] focus:bg-white" required /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold">{showPassword ? 'Hide' : 'Show'}</button></span></label>
      <a href={`/auth/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`} className="inline-block text-sm font-semibold text-[#b80f0a] underline">Reset password</a>
      {error ? <p className="rounded-lg border border-[#b80f0a] bg-[#fff5f5] px-3 py-2 text-sm text-[#b80f0a]">{error}</p> : null}
      <button type="submit" disabled={loading} className="w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </div></main>
}
