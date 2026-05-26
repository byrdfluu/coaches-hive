'use client'

import { useState } from 'react'

const BEEHIIV_PUB_ID = 'pub_f7a5a8ff-f500-4913-9bef-95437b544966'

function useSubscribeHandler() {
  const [email, setEmail] = useState('')

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    window.open(
      `https://coacheshivethebuild.beehiiv.com/subscribe?email=${encodeURIComponent(email)}`,
      '_blank',
    )
  }

  return { email, setEmail, handleSubmit }
}

export default function NewsletterSignup({ compact = false }: { compact?: boolean }) {
  const { email, setEmail, handleSubmit } = useSubscribeHandler()

  if (compact) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Newsletter</p>
        <p className="text-sm text-[#cfcfcf]">Follow the build</p>
        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="w-full rounded-full border border-[#3a3a3a] bg-[#1a1a1a] px-4 py-2.5 text-sm text-white placeholder-[#6b6b6b] outline-none focus:border-[#cfcfcf]"
          />
          <button
            type="submit"
            className="w-full rounded-full bg-[#b80f0a] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Subscribe →
          </button>
        </form>
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
          Product decisions, hard lessons, and what's actually working — straight from the founder. Monthly.
        </p>
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
            className="w-full rounded-full border border-[#3a3a3a] bg-[#1a1a1a] px-5 py-3 text-sm text-white placeholder-[#6b6b6b] outline-none focus:border-[#cfcfcf] sm:w-72"
          />
          <button
            type="submit"
            className="rounded-full bg-[#b80f0a] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Subscribe →
          </button>
        </form>
        <p className="mt-3 text-xs text-[#6b6b6b]">No spam. Unsubscribe anytime.</p>
      </div>
    </div>
  )
}
