'use client'

import { useEffect, useState } from 'react'
import AthleteSidebar from '@/components/AthleteSidebar'
import LoadingState from '@/components/LoadingState'

type Balance = { ledger_system: string; product_id: string; product_name: string; credit_type: string; credits_remaining: number; next_expiration?: string | null }
type History = { ledger_id: string; product_name: string; credit_type: string; delta: number; reason: string; expires_at?: string | null; occurred_at: string; note?: string | null }
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString() : '—'
const reason: Record<string, string> = { purchase: 'Grant', renewal: 'Grant', booking: 'Booking', return: 'Return', timely_cancellation: 'Return', academy_cancellation: 'Return', expiration: 'Expiration', refund: 'Refund reversal', refund_reversal: 'Refund reversal', restoration: 'Authorized restoration', authorized_restoration: 'Authorized restoration' }

export default function AthleteCreditsPage() {
  const [data, setData] = useState<{ balances: Balance[]; history: History[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { fetch('/api/athlete/credits', { cache: 'no-store' }).then(async response => {
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error || 'Unable to load credits.')
    setData(payload)
  }).catch(value => setError(value.message)) }, [])
  return <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[200px_1fr]">
    <AthleteSidebar/><main className="space-y-6"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#b80f0a]">Payments</p><h1 className="text-3xl font-black">My Credits</h1><p className="mt-2 text-sm text-[#666]">Available credits exclude expired cycles and match what can be booked now.</p></div>
    {!data && !error ? <LoadingState/> : null}{error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
    {data ? <><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.balances.length ? data.balances.map(row => <article key={`${row.ledger_system}:${row.product_id}:${row.credit_type}`} className="rounded-3xl border bg-white p-5"><p className="text-xs font-bold uppercase text-[#777]">{row.ledger_system} · {row.credit_type.replaceAll('_',' ')}</p><h2 className="mt-2 font-bold">{row.product_name}</h2><p className="mt-4 text-4xl font-black">{row.credits_remaining}</p><p className="text-sm text-[#666]">Next expiration: {date(row.next_expiration)}</p></article>) : <p className="text-sm text-[#666]">No spendable credits.</p>}</section>
    <section className="overflow-hidden rounded-3xl border bg-white"><div className="border-b p-5"><h2 className="text-xl font-black">Credit activity</h2></div><div className="divide-y">{data.history.length ? data.history.map(row => <div key={row.ledger_id} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto_auto]"><div><p className="font-bold">{row.product_name}</p><p className="text-sm text-[#666]">{reason[row.reason] || row.reason.replaceAll('_',' ')} · {row.credit_type.replaceAll('_',' ')}</p>{row.note ? <p className="mt-1 text-xs text-[#777]">{row.note}</p> : null}</div><p className={`text-lg font-black ${row.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>{row.delta > 0 ? '+' : ''}{row.delta}</p><p className="text-sm text-[#666]">{date(row.occurred_at)}<br/>Expires {date(row.expires_at)}</p></div>) : <p className="p-5 text-sm text-[#666]">No credit activity yet.</p>}</div></section></> : null}</main>
  </div>
}
