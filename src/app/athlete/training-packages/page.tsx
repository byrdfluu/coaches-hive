'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

export default function LegacyTrainingArchive() {
  const { activeSubProfileId, activeAthleteLabel } = useAthleteProfile()
  const [packages, setPackages] = useState<any[]>([])
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    if (!activeSubProfileId) return
    const response = await fetch(`/api/athlete/training-packages?athlete_profile_id=${encodeURIComponent(activeSubProfileId)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) setPackages(payload.packages || [])
    else setMessage(payload.error || 'Unable to load legacy training history.')
  }, [activeSubProfileId])
  useEffect(() => { void load() }, [load])

  const book = async (pkg: any) => {
    const sessionIds = selected[pkg.id] || []
    if (!sessionIds.length) return setMessage('Choose at least one session.')
    setBusy(pkg.id)
    const response = await fetch('/api/athlete/training-packages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'book', athlete_profile_id: activeSubProfileId, purchase_id: pkg.purchase.id, session_ids: sessionIds }) })
    const payload = await response.json().catch(() => ({}))
    setBusy('')
    setMessage(response.ok ? 'Sessions booked.' : payload.error || 'Unable to book sessions.')
    if (response.ok) { setSelected(current => ({ ...current, [pkg.id]: [] })); await load() }
  }

  const cancel = async (booking: any) => {
    const response = await fetch('/api/athlete/training-packages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', athlete_profile_id: activeSubProfileId, booking_id: booking.id }) })
    const payload = await response.json().catch(() => ({}))
    setMessage(response.ok ? (payload.credit_returned ? 'Session canceled and credit restored.' : 'Session canceled.') : payload.error || 'Unable to cancel session.')
    if (response.ok) await load()
  }

  return <main className="page-shell min-h-screen"><div className="mx-auto max-w-6xl px-5 py-10">
    <p className="public-kicker">Parent &amp; Athlete</p><h1 className="mt-2 text-4xl font-semibold">Legacy Training Archive</h1>
    <p className="mt-2 text-sm">Existing credits, bookings, and billing history for {activeAthleteLabel}. All new training products are available under Offerings.</p>
    <Link href="/athlete/programs" className="mt-4 inline-block rounded-full bg-[#b80f0a] px-5 py-3 font-semibold text-white">Browse Offerings</Link>
    {message ? <p role="status" className="mt-4 rounded-xl border bg-white p-3">{message}</p> : null}
    <div className="mt-6 space-y-6">{packages.map(pkg => { const ids = selected[pkg.id] || []; const active = ['active', 'paid', 'past_due'].includes(pkg.purchase?.status); return <article key={pkg.id} className="rounded-3xl border bg-white p-6">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-semibold">{pkg.name}</h2><p className="mt-1 text-sm">{pkg.description}</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-sm">Read-only legacy record</span></div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><p>Group credits available: {pkg.group_credits_remaining}</p><p>One-on-one credits available: {pkg.one_on_one_credits_remaining}</p><p>Purchase status: {pkg.purchase?.status || 'historical'}</p></div>
      {active ? <fieldset className="mt-5 space-y-2"><legend className="font-semibold">Eligible legacy sessions</legend>{pkg.occurrences.map((session: any) => <label key={session.id} className="flex gap-3 rounded-xl border p-3"><input type="checkbox" checked={ids.includes(session.id)} disabled={session.remaining_spots === 0} onChange={() => setSelected(current => ({ ...current, [pkg.id]: ids.includes(session.id) ? ids.filter(id => id !== session.id) : [...ids, session.id] }))}/><span><strong>{session.title}</strong><br/>{new Date(session.starts_at).toLocaleString('en-US', { timeZone: session.timezone || 'America/New_York' })} · {session.location || 'Location TBD'} · {session.remaining_spots} spots</span></label>)}</fieldset> : null}
      <div className="mt-4 flex flex-wrap gap-2">{active ? <button disabled={busy === pkg.id || !ids.length} onClick={() => void book(pkg)} className="rounded-full bg-[#191919] px-5 py-3 font-semibold text-white disabled:opacity-50">Use existing credits</button> : null}{pkg.migration?.unified_program_id ? <Link href={`/athlete/programs?offering_id=${pkg.migration.unified_program_id}`} className="rounded-full border px-5 py-3 font-semibold">Open migrated offering</Link> : null}{active && pkg.billing_type === 'recurring' ? <button onClick={async () => { const response = await fetch('/api/mobile/training-packages/billing-portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchase_id: pkg.purchase.id }) }); const payload = await response.json(); if (payload.url) window.location.assign(payload.url) }} className="rounded-full border px-5 py-3 font-semibold">Manage legacy billing</button> : null}</div>
      {pkg.bookings?.length ? <section className="mt-6"><h3 className="font-semibold">Bookings &amp; history</h3>{pkg.bookings.map((booking: any) => <div key={booking.id} className="mt-2 flex justify-between rounded-lg bg-[#f7f6f4] p-3 text-sm"><span>{booking.org_training_sessions?.title} · {booking.status}</span>{['reserved', 'pending_payment'].includes(booking.status) ? <button onClick={() => void cancel(booking)} className="rounded-full border px-3 py-1">Cancel</button> : null}</div>)}</section> : null}
    </article>})}{!packages.length ? <p className="rounded-2xl border bg-white p-5">No legacy training history for this athlete.</p> : null}</div>
  </div></main>
}
