'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import LogoMark from '@/components/LogoMark'

type InviteStatus =
  | { state: 'loading' }
  | { state: 'valid'; guardianEmail: string; athleteName: string }
  | { state: 'already_accepted' }
  | { state: 'expired' }
  | { state: 'invalid' }

export default function GuardianAcceptInvitePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || ''

  const [inviteStatus, setInviteStatus] = useState<InviteStatus>({ state: 'loading' })
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!token) {
      setInviteStatus({ state: 'invalid' })
      return
    }
    fetch(`/api/guardian-invites?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.valid) {
          setInviteStatus({ state: data.reason === 'already_accepted' ? 'already_accepted' : 'expired' })
        } else {
          setInviteStatus({ state: 'valid', guardianEmail: data.guardian_email, athleteName: data.athlete_name })
        }
      })
      .catch(() => setInviteStatus({ state: 'invalid' }))
  }, [token])

  const capitalize = (s: string) => s.trim().replace(/\b\w/g, (c) => c.toUpperCase())
  const fullName = `${capitalize(firstName)} ${capitalize(lastName)}`.replace(/\s+/g, ' ').trim()
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (inviteStatus.state !== 'valid') return
    setFormError('')

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('First and last name are required.')
      return
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }

    setLoading(true)
    const res = await fetch('/api/guardian-invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, full_name: fullName, password }),
    })
    const data = await res.json().catch(() => null)
    setLoading(false)

    if (!res.ok) {
      setFormError(data?.error || 'Unable to create account. Please try again.')
      return
    }

    const email = inviteStatus.guardianEmail
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('pending_verification_email', email)
      window.localStorage.setItem('pending_verification_role', 'guardian')
      if (data.code_length) {
        window.localStorage.setItem('pending_verification_code_length', String(data.code_length))
      }
    }

    router.push(`/auth/verify?role=guardian&email=${encodeURIComponent(email)}&sent=1`)
  }

  if (inviteStatus.state === 'loading') {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto flex max-w-lg flex-col items-center px-6 py-24">
          <p className="text-sm text-[#4a4a4a]">Validating invite…</p>
        </div>
      </main>
    )
  }

  if (inviteStatus.state === 'already_accepted') {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold text-[#191919]">Invite already used</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            This invite link has already been accepted. If you have an account, please log in.
          </p>
          <Link
            href="/login"
            className="mt-6 rounded-full bg-[#191919] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-80 transition-opacity"
          >
            Log in
          </Link>
        </div>
      </main>
    )
  }

  if (inviteStatus.state === 'expired' || inviteStatus.state === 'invalid') {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold text-[#191919]">
            {inviteStatus.state === 'expired' ? 'Invite expired' : 'Invalid invite link'}
          </h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            {inviteStatus.state === 'expired'
              ? 'This invite link has expired. Ask the athlete to resend the guardian invite.'
              : 'This invite link is not valid. Check that you used the full link from the email.'}
          </p>
        </div>
      </main>
    )
  }

  // state === 'valid'
  const { guardianEmail, athleteName } = inviteStatus

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 py-12">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden">
          <LogoMark className="h-12 w-12" size={48} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#191919]">Create your guardian account</h1>
        <p className="mt-1 text-sm text-[#4a4a4a]">
          You were listed as the guardian for <strong>{athleteName}</strong>.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 w-full max-w-lg space-y-5 rounded-2xl border border-[#191919] bg-white p-6 shadow-[0_18px_50px_rgba(25,25,25,0.08)]"
        >
          <div className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
            <p className="text-xs font-semibold text-[#4a4a4a]">Account email</p>
            <p className="mt-0.5 font-semibold text-[#191919]">{guardianEmail}</p>
            <p className="mt-1 text-xs text-[#4a4a4a]">This is the email tied to your guardian invite and cannot be changed.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#191919]">First Name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                required
                className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#191919]">Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                required
                className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#191919]">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 pr-16 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#191919] hover:text-[#b80f0a]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#191919]">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full rounded-lg border bg-[#f5f5f5] px-3 py-3 pr-16 text-sm text-[#191919] outline-none focus:bg-white ${
                  passwordsMismatch ? 'border-[#b80f0a] focus:border-[#b80f0a]' : 'border-[#dcdcdc] focus:border-[#191919]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#191919] hover:text-[#b80f0a]"
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
            {passwordsMismatch && (
              <p className="text-xs text-[#b80f0a]">Passwords do not match.</p>
            )}
          </div>

          {formError && (
            <p className="rounded-lg border border-[#b80f0a] bg-[#fff5f5] px-3 py-2 text-xs text-[#b80f0a]">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create guardian account'}
          </button>

          <p className="text-center text-sm text-[#4a4a4a]">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-[#191919] underline">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </main>
  )
}
