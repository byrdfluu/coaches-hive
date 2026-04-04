'use client'

import { useMemo, useState } from 'react'

type InviteType = 'coach' | 'athlete' | 'guardian'

const inviteTypeLabels: Record<InviteType, { title: string; helper: string }> = {
  coach: {
    title: 'Coach',
    helper: 'Invite a coach to join Coaches Hive.',
  },
  athlete: {
    title: 'Athlete',
    helper: 'Invite an athlete to join Coaches Hive.',
  },
  guardian: {
    title: 'Guardian',
    helper: 'Invite a guardian to create an approval account.',
  },
}

export default function InviteUserModal({
  open,
  onClose,
  allowedTypes,
  defaultType,
  onSent,
}: {
  open: boolean
  onClose: () => void
  allowedTypes: InviteType[]
  defaultType?: InviteType
  onSent?: (message: string) => void
}) {
  const initialType = useMemo(
    () => (defaultType && allowedTypes.includes(defaultType) ? defaultType : allowedTypes[0] || 'coach'),
    [allowedTypes, defaultType],
  )
  const [inviteType, setInviteType] = useState<InviteType>(initialType)
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)

  if (!open) return null

  const resetAndClose = () => {
    setInviteType(initialType)
    setEmail('')
    setNotice('')
    setSending(false)
    onClose()
  }

  const handleSend = async () => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setNotice('Enter an email address.')
      return
    }

    setSending(true)
    setNotice('')
    try {
      const response = await fetch('/api/invites/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, invite_type: inviteType }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to send invite.')
      }
      onSent?.(`Invite sent to ${trimmedEmail}.`)
      resetAndClose()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send invite.')
      setSending(false)
    }
  }

  const selectedCopy = inviteTypeLabels[inviteType]

  return (
    <div className="fixed inset-0 z-[90] bg-[#191919]/55 backdrop-blur-sm">
      <div className="absolute inset-x-3 bottom-3 mx-auto w-auto max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-[28px] border border-[#191919] bg-white p-5 shadow-[0_32px_70px_rgba(25,25,25,0.22)] sm:inset-x-4 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-y-1/2 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Invite user</p>
            <h2 className="mt-2 text-xl font-semibold text-[#191919]">Send a Coaches Hive invite</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">{selectedCopy.helper}</p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#191919] transition hover:border-[#191919]"
            aria-label="Close invite modal"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <label className="block space-y-2 text-sm text-[#191919]">
            <span className="font-semibold">User type</span>
            <select
              value={inviteType}
              onChange={(event) => setInviteType(event.target.value as InviteType)}
              className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
            >
              {allowedTypes.map((type) => (
                <option key={type} value={type}>
                  {inviteTypeLabels[type].title}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2 text-sm text-[#191919]">
            <span className="font-semibold">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
            />
          </label>

          {notice ? <p className="text-xs text-[#b80f0a]">{notice}</p> : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="w-full rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {sending ? 'Sending...' : 'Send invite'}
          </button>
          <button
            type="button"
            onClick={resetAndClose}
            className="w-full rounded-full border border-[#191919] px-5 py-2 text-sm font-semibold text-[#191919] transition hover:bg-[#191919] hover:text-[#b80f0a] sm:w-auto"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
