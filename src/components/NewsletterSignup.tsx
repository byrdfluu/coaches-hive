'use client'

import { useState } from 'react'

function useSubscribe() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
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

  return { email, setEmail, status, errorMsg, handleSubmit }
}

export default function NewsletterSignup({ compact = false }: { compact?: boolean }) {
  const { email, setEmail, status, errorMsg, handleSubmit } = useSubscribe()

  if (compact) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Newsletter</p>
        <p className="text-sm text-[#cfcfcf]">Follow the build</p>
        {status === 'success' ? (
          <p className="text-sm font-semibold text-[#4ade80]">You&apos;re in. Check your inbox.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={status === 'loading'}
              className="w-full rounded-full border border-[#3a3a3a] bg-[#1a1a1a] px-4 py-2.5 text-sm text-white placeholder-[#6b6b6b] outline-none focus:border-[#cfcfcf] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full rounded-full bg-[#b80f0a] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {status === 'loading' ? 'Subscribing…' : 'Subscribe →'}
            </button>
            {status === 'error' && (
              <p className="text-[11px] text-red-400">{errorMsg}</p>
            )}
          </form>
        )}
        <p className="text-[11px] text-[#6b6b6b]">No spam. Unsubscribe anytime.</p>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#191919] bg-[#0e0e0e] px-6 py-10 sm:px-10">
      <div className="pointer-events-none absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#b80f0a]/20 blur-3xl" />
      <div className="relative mx-auto max-w-2xl text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Coaches Hive: The Build</p>
        <h2 className="mt-3 text-3xl font-semibold text-white">Follow the build</h2>
        <p className="mt-3 text-[#cfcfcf]">
          Product decisions, hard lessons, and what&apos;s actually working — straight from the founder. Monthly.
        </p>
        {status === 'success' ? (
          <p className="mt-6 text-lg font-semibold text-[#4ade80]">You&apos;re in. Check your inbox.</p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={status === 'loading'}
              className="w-full rounded-full border border-[#3a3a3a] bg-[#1a1a1a] px-5 py-3 text-sm text-white placeholder-[#6b6b6b] outline-none focus:border-[#cfcfcf] disabled:opacity-60 sm:w-72"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="rounded-full bg-[#b80f0a] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {status === 'loading' ? 'Subscribing…' : 'Subscribe →'}
            </button>
          </form>
        )}
        {status === 'error' && (
          <p className="mt-2 text-sm text-red-400">{errorMsg}</p>
        )}
        <p className="mt-3 text-xs text-[#6b6b6b]">No spam. Unsubscribe anytime.</p>
      </div>
    </div>
  )
}
