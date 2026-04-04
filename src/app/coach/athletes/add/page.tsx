'use client'

import Link from 'next/link'
import { useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import Toast from '@/components/Toast'

export default function AddAthletePage() {
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [sport, setSport] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState('Active')
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setNotice('')
    const response = await fetch('/api/invites/athlete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fullName,
        email,
        sport,
        location,
        status,
        label,
        notes,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setNotice(payload?.error || 'Unable to save athlete.')
      setSaving(false)
      return
    }
    setToast(payload?.status === 'linked' ? 'Athlete linked' : 'Invite sent')
    setNotice(payload?.status === 'linked' ? 'Existing athlete account linked to your roster.' : 'Athlete invite queued.')
    setFullName('')
    setEmail('')
    setSport('')
    setLocation('')
    setStatus('Active')
    setLabel('')
    setNotes('')
    setSaving(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="glass-card space-y-6 border border-[#191919] bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Add athlete</p>
                <h1 className="mt-1 text-2xl font-semibold text-[#191919]">Invite or link an athlete</h1>
                <p className="mt-1 text-sm text-[#4a4a4a]">
                  If the athlete already has an account, they will be linked. Otherwise Coaches Hive will send an invite email.
                </p>
              </div>
              <Link href="/coach/athletes" className="text-sm font-semibold text-[#b80f0a]">
                Back to athletes
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Full name</span>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  placeholder="Alex Morgan"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Email</span>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  placeholder="alex@example.com"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Sport</span>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  placeholder="Soccer, Basketball, Strength..."
                  value={sport}
                  onChange={(event) => setSport(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Location</span>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  placeholder="City, State"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Status</span>
                <select
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                  <option>VIP</option>
                  <option>Team</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Label</span>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  placeholder="VIP, Team, Onboarding..."
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </label>
            </div>

            <label className="space-y-2 text-sm text-[#191919]">
              <span>Notes</span>
              <textarea
                className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                rows={4}
                placeholder="Goals, preferences, injuries, availability..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>

            {notice && <p className="text-xs text-[#b80f0a]">{notice}</p>}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                {saving ? 'Working...' : 'Invite or link athlete'}
              </button>
              <Link
                href="/coach/athletes"
                className="rounded-full border border-[#191919] px-5 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
