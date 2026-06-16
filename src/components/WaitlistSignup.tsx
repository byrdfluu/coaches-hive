'use client'

import { useState } from 'react'

type Role = 'org' | 'coach' | 'athlete'

const roles: { value: Role; label: string; placeholder: string }[] = [
  { value: 'org', label: "I'm an Org", placeholder: 'Program director email' },
  { value: 'coach', label: "I'm a Coach", placeholder: 'Coach email' },
  { value: 'athlete', label: "I'm an Athlete", placeholder: 'Athlete email' },
]

function useWaitlist() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('org')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Something went wrong.')
        setStatus('error')
      } else {
        setStatus('success')
        setEmail('')
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return { email, setEmail, role, setRole, status, errorMsg, handleSubmit }
}

export default function WaitlistSignup({ variant = 'inline' }: { variant?: 'inline' | 'standalone' }) {
  const { email, setEmail, role, setRole, status, errorMsg, handleSubmit } = useWaitlist()
  const activeRole = roles.find((r) => r.value === role)!

  if (variant === 'standalone') {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-[#191919] bg-[#0e0e0e] px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#b80f0a]/20 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Early access</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Get notified when we launch.</h2>
          <p className="mt-3 text-[#cfcfcf]">
            Join the waitlist and be first to know. We&apos;ll reach out personally when your spot is ready.
          </p>
          {status === 'success' ? (
            <p className="mt-6 text-lg font-semibold text-[#4ade80]">You&apos;re on the list. We&apos;ll be in touch.</p>
          ) : (
            <>
              <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-[#3a3a3a] bg-[#1a1a1a] p-1">
                {roles.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      role === r.value ? 'bg-[#b80f0a] text-white' : 'text-[#cfcfcf] hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={activeRole.placeholder}
                  required
                  disabled={status === 'loading'}
                  className="w-full rounded-full border border-[#3a3a3a] bg-[#1a1a1a] px-5 py-3 text-sm text-white placeholder-[#6b6b6b] outline-none focus:border-[#cfcfcf] disabled:opacity-60 sm:w-72"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="rounded-full bg-[#b80f0a] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {status === 'loading' ? 'Joining…' : 'Join waitlist →'}
                </button>
              </form>
              {status === 'error' && <p className="mt-2 text-sm text-red-400">{errorMsg}</p>}
              <p className="mt-3 text-xs text-[#6b6b6b]">No spam. We&apos;ll only reach out about your access.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  // inline variant — for hero section
  return (
    <div className="space-y-3">
      {status === 'success' ? (
        <div className="rounded-2xl border border-[#dcdcdc] bg-white px-5 py-4 text-sm font-semibold text-[#191919]">
          You&apos;re on the list. We&apos;ll reach out when you&apos;re up.
        </div>
      ) : (
        <>
          <div className="inline-flex items-center gap-1 rounded-full border border-[#d7d7d7] bg-white p-1 shadow-[0_2px_8px_rgba(25,25,25,0.06)]">
            {roles.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  role === r.value ? 'bg-[#191919] text-white' : 'text-[#4a4a4a] hover:text-[#191919]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={activeRole.placeholder}
              required
              disabled={status === 'loading'}
              className="w-full rounded-full border border-[#d7d7d7] bg-white px-4 py-2.5 text-sm text-[#191919] placeholder-[#9a9a9a] outline-none focus:border-[#191919] disabled:opacity-60 sm:w-64"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="rounded-full bg-[#b80f0a] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {status === 'loading' ? 'Joining…' : 'Join waitlist →'}
            </button>
          </form>
          {status === 'error' && <p className="text-xs text-[#b80f0a]">{errorMsg}</p>}
        </>
      )}
    </div>
  )
}
