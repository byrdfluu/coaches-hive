'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function LegacyTrainingPackageDetail() {
  const { id } = useParams<{ id: string }>()
  const [pkg, setPackage] = useState<any>(null)
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    const response = await fetch('/api/org/training-packages', { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    const found = (payload.packages || []).find((row: any) => row.id === id)
    setPackage(found || null); setMessage(response.ok ? (found ? '' : 'Package not found.') : payload.error || 'Unable to load package.')
  }, [id])
  useEffect(() => { void load() }, [load])
  if (!pkg) return <main className="page-shell min-h-screen p-8">{message || 'Loading package…'}</main>
  return <main className="page-shell min-h-screen"><div className="mx-auto max-w-6xl px-5 py-10"><Link href="/org/training-packages" className="font-semibold underline">← Legacy Training Archive</Link><div className="mt-5 flex flex-wrap justify-between gap-4"><div><p className="public-kicker">Read-only legacy record</p><h1 className="mt-2 text-4xl font-semibold">{pkg.name}</h1><p className="mt-2 capitalize">{pkg.status} · {pkg.group_credits} group · {pkg.one_on_one_credits} one-on-one credits</p></div>{pkg.migration?.unified_program_id ? <Link href={`/org/offerings/${pkg.migration.unified_program_id}`} className="rounded-full bg-[#b80f0a] px-5 py-3 font-semibold text-white">Open unified offering</Link> : null}</div><div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="rounded-3xl border bg-white p-6"><h2 className="text-xl font-semibold">Historical dates &amp; times</h2><div className="mt-4 space-y-2">{pkg.sessions.map((session: any) => <Link href={`/org/training-sessions/${session.id}`} key={session.id} className="block rounded-xl border p-3"><strong>{session.title || 'Training session'}</strong><br/>{new Date(session.starts_at).toLocaleString('en-US', { timeZone: session.timezone || 'America/New_York' })} · {session.location || 'Location TBD'} · {session.status}</Link>)}{!pkg.sessions.length ? <p>No linked legacy sessions.</p> : null}</div></section><section className="rounded-3xl border bg-white p-6"><h2 className="text-xl font-semibold">Purchase and credit history</h2><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><p>Active purchasers<br/><strong>{pkg.metrics?.active_purchases || 0}</strong></p><p>Total bookings<br/><strong>{pkg.metrics?.bookings || 0}</strong></p><p>Credits used<br/><strong>{pkg.metrics?.credits_used || 0}</strong></p><p>Credits remaining<br/><strong>{pkg.metrics?.credits_remaining || 0}</strong></p></div><div className="mt-5 space-y-2">{pkg.purchases.map((purchase: any) => <p key={purchase.id} className="rounded-lg bg-[#f7f6f4] p-3 text-sm">{purchase.status} · {purchase.current_period_end || purchase.expires_at ? new Date(purchase.current_period_end || purchase.expires_at).toLocaleDateString() : 'No expiry recorded'}</p>)}</div></section></div></div></main>
}
