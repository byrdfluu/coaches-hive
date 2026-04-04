'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import LogoMark from '@/components/LogoMark'

export default function SignUpPage() {
  const [role, setRole] = useState<'coach' | 'athlete' | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [accountOwnerType, setAccountOwnerType] = useState<'athlete_adult' | 'athlete_minor'>(
    'athlete_adult',
  )
  const [athleteBirthdate, setAthleteBirthdate] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianEmail, setGuardianEmail] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedTierFromQuery = (searchParams.get('tier') || '').trim()
  // Referral code capture is disabled until incentives are implemented.
  // When ready: const referralCode = (searchParams.get('ref') || '').trim().toUpperCase()

  useEffect(() => {
    if (role !== 'athlete') {
      setAccountOwnerType('athlete_adult')
      setAthleteBirthdate('')
      setGuardianName('')
      setGuardianEmail('')
      setGuardianPhone('')
    }
}, [role])

  const capitalize = (s: string) => s.trim().replace(/\b\w/g, (c) => c.toUpperCase())
  const fullNameValue = `${capitalize(firstName)} ${capitalize(lastName)}`.replace(/\s+/g, ' ').trim()

  // Guardian accounts are created via invite only — no auto-fill needed

  useEffect(() => {
    const requestedRole = searchParams.get('role')
    if (requestedRole === 'coach' || requestedRole === 'athlete') {
      setRole(requestedRole)
      return
    }
  }, [searchParams])

  useEffect(() => {
    const emailFromParam = searchParams.get('email')
    if (emailFromParam) setEmail(emailFromParam)
  }, [searchParams])

  const getAge = (value: string) => {
    if (!value) return null
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return null
    const now = new Date()
    let age = now.getFullYear() - date.getFullYear()
    const birthdayThisYear = new Date(date)
    birthdayThisYear.setFullYear(now.getFullYear())
    if (now < birthdayThisYear) age -= 1
    return age
  }

  const birthdateAge = athleteBirthdate ? getAge(athleteBirthdate) : null
  const needsGuardian =
    role === 'athlete' &&
    (accountOwnerType === 'athlete_minor' || (birthdateAge !== null && birthdateAge < 18))
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 py-12">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden">
          <LogoMark className="h-12 w-12" size={48} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#191919]">Sign Up</h1>
        <p className="mt-1 text-sm text-[#4a4a4a]">
          Create your account to get started.
        </p>

        <form
          className="mt-6 w-full max-w-lg space-y-5 rounded-2xl border border-[#191919] bg-white p-6 shadow-[0_18px_50px_rgba(25,25,25,0.08)]"
          onSubmit={async (event) => {
            handleSubmit(event)
            setFormError(null)
            setNotice(null)
            if (!firstName.trim() || !lastName.trim()) {
              setFormError('First name and last name are required.')
              return
            }
            if (!role) {
              setFormError('Please select Coach, Athlete, Guardian, or Organization before continuing.')
              return
            }
            if (role === 'athlete') {
              if (!athleteBirthdate) {
                setFormError('Please enter the athlete birthdate.')
                return
              }
              if (birthdateAge !== null && birthdateAge < 18 && accountOwnerType === 'athlete_adult') {
                setFormError('This athlete is under 18. Choose Athlete under 18 or Parent/Guardian.')
                return
              }
              if (needsGuardian) {
                if (!guardianName.trim() || !guardianEmail.trim() || !guardianPhone.trim()) {
                  setFormError('Guardian name, email, and phone are required for athletes under 18.')
                  return
                }
                if (guardianEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
                  setFormError('Guardian email must be different from the athlete email.')
                  return
                }
              }
            }
            if (password !== confirmPassword) {
              setFormError('Passwords do not match.')
              return
            }
            setLoading(true)
            const trimmedEmail = email.trim().toLowerCase()
            const response = await fetch('/api/auth/signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: trimmedEmail,
                password,
                role,
                full_name: fullNameValue,
                selected_tier: selectedTierFromQuery || undefined,
                lifecycle_state: 'awaiting_verification',
                lifecycle_updated_at: new Date().toISOString(),
                account_owner_type: role === 'athlete' ? accountOwnerType : undefined,
                athlete_birthdate: role === 'athlete' ? athleteBirthdate : undefined,
                guardian_name: role === 'athlete' ? guardianName.trim() || undefined : undefined,
                guardian_email: role === 'athlete' ? guardianEmail.trim() || undefined : undefined,
                guardian_phone: role === 'athlete' ? guardianPhone.trim() || undefined : undefined,
              }),
            })
            const responsePayload = await response.json().catch(() => null)
            setLoading(false)
            if (!response.ok) {
              setFormError(responsePayload?.error || 'Unable to create account.')
              return
            }

            if (typeof window !== 'undefined') {
              window.localStorage.setItem('pending_verification_email', trimmedEmail)
              window.localStorage.setItem('pending_verification_role', role)
              if (selectedTierFromQuery) {
                window.localStorage.setItem('pending_verification_tier', selectedTierFromQuery)
              } else {
                window.localStorage.removeItem('pending_verification_tier')
              }
              const codeLength = Number(responsePayload?.code_length)
              if (Number.isInteger(codeLength) && codeLength >= 4 && codeLength <= 10) {
                window.localStorage.setItem('pending_verification_code_length', String(codeLength))
              } else {
                window.localStorage.removeItem('pending_verification_code_length')
              }
            }
            setNotice(`We sent a verification code to ${trimmedEmail}.`)
            const tierParam = selectedTierFromQuery ? `&tier=${encodeURIComponent(selectedTierFromQuery)}` : ''
            router.push(`/auth/verify?role=${encodeURIComponent(role)}${tierParam}&email=${encodeURIComponent(trimmedEmail)}&sent=1`)
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#191919]">First Name</label>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First name"
                required
                className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#191919]">Last Name</label>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last name"
                required
                className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#191919]">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="example@gmail.com"
              className="w-full rounded-lg border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-3 text-sm text-[#191919] outline-none focus:border-[#191919] focus:bg-white"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#191919]">Password</label>
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
            <label className="text-sm font-semibold text-[#191919]">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                className={`w-full rounded-lg border bg-[#f5f5f5] px-3 py-3 pr-16 text-sm text-[#191919] outline-none focus:bg-white ${
                  passwordsMismatch
                    ? 'border-[#b80f0a] focus:border-[#b80f0a]'
                    : 'border-[#dcdcdc] focus:border-[#191919]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#191919] transition hover:text-[#b80f0a]"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {passwordsMismatch ? (
              <p className="text-xs text-[#b80f0a]" aria-live="polite">
                Passwords do not match.
              </p>
            ) : null}
          </div>

          <div className="space-y-4 text-sm text-[#191919]">
            <p className="text-[#4a4a4a]">
              Select one option below to create the right account for you:
            </p>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="role"
                className="h-4 w-4 accent-[#b80f0a]"
                checked={role === 'coach'}
                onChange={() => setRole('coach')}
              />
              <span>I&apos;m a Coach</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="role"
                className="h-4 w-4 accent-[#b80f0a]"
                checked={role === 'athlete'}
                onChange={() => setRole('athlete')}
              />
              <span>I&apos;m an Athlete</span>
            </label>
            <p className="text-xs text-[#4a4a4a] pt-1">
              Guardian?{' '}
              <Link href="/login" className="font-semibold text-[#191919] underline">Sign in</Link>
              {' '}or check your email for an invite link from your athlete.
            </p>
            {role === 'athlete' && (
              <div className="space-y-3 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 text-sm text-[#191919]">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Athlete details</p>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#191919]">Account owner</span>
                  <select
                    value={accountOwnerType}
                    onChange={(event) =>
                      setAccountOwnerType(event.target.value as 'athlete_adult' | 'athlete_minor')
                    }
                    className="w-full rounded-lg border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  >
                    <option value="athlete_adult">Athlete (18+)</option>
                    <option value="athlete_minor">Athlete under 18</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#191919]">Athlete birthdate</span>
                  <input
                    type="date"
                    value={athleteBirthdate}
                    onChange={(event) => setAthleteBirthdate(event.target.value)}
                    className="block w-full min-w-0 max-w-full rounded-lg border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}
                  />
                </label>
                {needsGuardian && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#191919]">Guardian name</span>
                      <input
                        value={guardianName}
                        onChange={(event) => setGuardianName(event.target.value)}
                        placeholder="Parent/guardian name"
                        className="w-full rounded-lg border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#191919]">Guardian email</span>
                      <input
                        type="email"
                        value={guardianEmail}
                        onChange={(event) => setGuardianEmail(event.target.value)}
                        placeholder="parent@example.com"
                        className="w-full rounded-lg border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#191919]">Guardian phone</span>
                      <input
                        value={guardianPhone}
                        onChange={(event) => setGuardianPhone(event.target.value)}
                        placeholder="+1 (555) 123-4567"
                        className="w-full rounded-lg border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
            <label className="flex items-start gap-2 leading-relaxed text-[#4a4a4a]">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#b80f0a]" />
              <span>
                By creating an account you agree to the{' '}
                <Link href="/terms" className="underline">
                  terms of use
                </Link>{' '}
                and our{' '}
                <Link href="/privacy" className="underline">
                  privacy policy
                </Link>
                .
              </span>
            </label>
            <p className="text-xs text-[#4a4a4a]">
              After sign up, you will pick your plan before entering your dashboard.
            </p>
          </div>

          <button
            type="submit"
            className="mt-2 w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#b80f0a]"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
          {notice && (
            <p className="rounded-lg border border-[#191919] bg-[#f5f5f5] px-3 py-2 text-xs text-[#191919]">
              {notice}
            </p>
          )}
          {formError && (
            <p className="rounded-lg border border-[#b80f0a] bg-[#fff5f5] px-3 py-2 text-xs text-[#b80f0a]">
              {formError}
            </p>
          )}

          <p className="mt-2 text-center text-sm text-[#4a4a4a]">
            Already have an account?{' '}
            <a href="/login" className="font-semibold text-[#191919] underline">
              Log in
            </a>
          </p>
        </form>
      </div>
    </main>
  )
}
