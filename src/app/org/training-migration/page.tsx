'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function LegacyTrainingMigrationStatusPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  useEffect(() => { void fetch('/api/org/training-migration-status', { cache: 'no-store' }).then(async response => {
    const payload = await response.json().catch(() => ({})); if (response.ok) setData(payload); else setError(payload.error || 'Unable to load migration status.')
  }) }, [])
  return <main className="page-shell min-h-screen"><div className="mx-auto max-w-7xl px-5 py-10"><Link href="/org/training-packages" className="font-semibold underline">← Legacy Training Archive</Link><p className="public-kicker mt-6">Private organization view</p><h1 className="mt-2 text-4xl font-semibold">Legacy Training Migration Status</h1><p className="mt-2 text-sm text-[#666]">Read-only reconciliation status. Exceptions are flagged for manual review and are never repaired automatically.</p>{error ? <p role="alert" className="mt-4 rounded-xl border bg-white p-3">{error}</p> : null}<section className="mt-6 space-y-3">{(data?.inventory || []).map((row: any) => <article key={row.legacy_package_id} className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">{row.name}</h2><p className="text-sm">Legacy {row.legacy_status} · Unified {row.unified_status || 'unmapped'} · {row.migration_status || 'not migrated'}</p></div>{row.unified_program_id ? <Link href={`/org/offerings/${row.unified_program_id}`} className="font-semibold underline">Open unified offering</Link> : null}</div><div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-5"><span>{row.purchase_count} purchases</span><span>{row.session_count} sessions</span><span>{row.checkout_count} checkouts</span><span>{row.subscription_count} subscriptions</span><span>{row.outstanding_legacy_credits} outstanding credits</span></div></article>)}{data && !data.inventory.length ? <p className="rounded-2xl border bg-white p-5">No legacy packages found.</p> : null}</section>{data?.exceptions?.length ? <section className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5"><h2 className="text-xl font-semibold">Reconciliation exceptions</h2>{data.exceptions.map((row: any) => <p key={row.legacy_purchase_id} className="mt-2 text-sm">Purchase {row.legacy_purchase_id}: <strong>{row.reconciliation_status}</strong> ({row.legacy_balance} credits)</p>)}</section> : null}</div></main>
}
