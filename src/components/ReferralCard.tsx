'use client'

import { useEffect, useMemo, useState } from 'react'

type ReferralCardProps = {
  role: 'coach' | 'athlete' | 'org'
}

type ReferralStatus = 'loading' | 'ready' | 'unavailable'

export default function ReferralCard({ role }: ReferralCardProps) {
  const [code, setCode] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')
  const [status, setStatus] = useState<ReferralStatus>('loading')

  useEffect(() => {
    if (typeof window === 'undefined') return
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch('/api/referrals')
        if (!response.ok) {
          throw new Error('Unable to load referrals')
        }
        const payload = await response.json()
        if (!active) return
        setCode(payload.code || null)
        setTotal(payload.total || 0)
        setStatus(payload.unavailable ? 'unavailable' : payload.code ? 'ready' : 'unavailable')
      } catch (error) {
        if (!active) return
        console.error('Unable to load referrals:', error)
        setStatus('unavailable')
        setTotal(0)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const headline =
    role === 'coach'
      ? 'Invite coaches to join your network'
      : role === 'athlete'
        ? 'Invite athletes to join Coaches Hive'
        : 'Invite staff and families to your org'

  const defaultDescription =
    role === 'coach'
      ? 'Share your link so other coaches can build alongside you.'
      : role === 'athlete'
        ? 'Share your link with teammates, parents, or training partners.'
        : 'Share your link with staff, coaches, or families who should join.'
  const fallbackDescription =
    'Referrals are temporarily disabled. Re-run supabase/referrals.sql or contact your admin to re-enable the invite flow.'
  const description = status === 'unavailable' ? fallbackDescription : defaultDescription

  const inviteLink = useMemo(() => {
    if (!origin || !code) return ''
    return `${origin}/signup?ref=${code}`
  }, [origin, code])

  const codeLabel =
    status === 'unavailable'
      ? 'Referral code unavailable'
      : code
        ? `Code ${code}`
        : 'Generating code...'

  const isInviteDisabled = !inviteLink || status !== 'ready'

  const handleCopy = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="glass-card border border-[#191919] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Referrals</p>
          <h3 className="mt-2 text-lg font-semibold text-[#191919]">{headline}</h3>
          <p className="mt-2 text-sm text-[#4a4a4a]">{description}</p>
        </div>
        <div className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
          {total} signups
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs font-semibold text-[#191919]">
          {codeLabel}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
          disabled={isInviteDisabled}
        >
          {copied ? 'Copied' : 'Copy invite link'}
        </button>
      </div>
      {status === 'unavailable' ? (
        <p className="mt-2 text-[11px] text-[#b80f0a]">
          Referrals are offline until the Supabase referral tables are present.
        </p>
      ) : null}
    </div>
  )
}
