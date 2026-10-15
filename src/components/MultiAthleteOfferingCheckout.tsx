'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AthleteProfileSummary } from '@/components/AthleteProfileContext'
import {
  checkoutSummary,
  readCheckoutWorkflows,
  saveCheckoutWorkflow,
  stableAthleteCheckoutKey,
  updateCheckoutRow,
  type AthleteCheckoutRow,
  type MultiAthleteCheckoutWorkflow,
} from '@/lib/multiAthleteCheckout'
import { supabase } from '@/lib/supabaseClient'

type Offering = { id: string; org_id: string; name: string; type: string; billing_type?: string | null }

const statusLabel: Record<AthleteCheckoutRow['status'], string> = {
  pending: 'Pending', preparing: 'Preparing', checkout_ready: 'Checkout ready',
  payment_processing: 'Payment processing', enrolled: 'Enrolled', failed: 'Failed', cancelled: 'Cancelled',
}

const captureOfferingEvent = (event: string, properties: Record<string, string | number | boolean | null>) => {
  void fetch('/api/mobile/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, properties }) }).catch(() => undefined)
}

export default function MultiAthleteOfferingCheckout({
  offering,
  athletes,
  activeAthleteId,
  occurrenceIds,
  onRefresh,
}: {
  offering: Offering
  athletes: AthleteProfileSummary[]
  activeAthleteId: string | null
  occurrenceIds: string[]
  onRefresh: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(activeAthleteId ? [activeAthleteId] : [])
  const [workflow, setWorkflow] = useState<MultiAthleteCheckoutWorkflow | null>(null)
  const [busyAthleteId, setBusyAthleteId] = useState<string | null>(null)

  useEffect(() => {
    const saved = readCheckoutWorkflows().find(item => item.offeringId === offering.id)
    if (saved) { setWorkflow(saved); setOpen(true) }
  }, [offering.id])

  const persist = (next: MultiAthleteCheckoutWorkflow) => {
    setWorkflow(next)
    saveCheckoutWorkflow(next)
  }

  const start = async () => {
    if (!selected.length || !occurrenceIds.length) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const rows = await Promise.all(selected.map(async athleteId => ({
      athleteId,
      athleteName: athletes.find(athlete => athlete.id === athleteId)?.name || 'Athlete',
      status: 'pending' as const,
      idempotencyKey: await stableAthleteCheckoutKey({ parentId: session.user.id, athleteId, offeringId: offering.id, occurrenceIds }),
    })))
    captureOfferingEvent('offering_athletes_selected', { org_id: offering.org_id, offering_id: offering.id,
      offering_type: offering.type || 'program', athlete_count: selected.length, is_multi_athlete: selected.length > 1 })
    captureOfferingEvent('offering_dates_selected', { org_id: offering.org_id, offering_id: offering.id,
      offering_type: offering.type || 'program', occurrence_count: occurrenceIds.length })
    persist({ offeringId: offering.id, offeringName: offering.name, organizationId: offering.org_id,
      offeringType: offering.type || 'program', billingType: offering.billing_type || 'one_time',
      occurrenceIds: [...occurrenceIds].sort(), rows, updatedAt: new Date().toISOString() })
  }

  const prepare = async (athleteId: string) => {
    if (!workflow || busyAthleteId) return
    const row = workflow.rows.find(item => item.athleteId === athleteId)
    if (!row || !['pending', 'failed', 'cancelled', 'checkout_ready'].includes(row.status)) return
    setBusyAthleteId(athleteId)
    persist(updateCheckoutRow(workflow, athleteId, { status: 'preparing', message: undefined }))
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      persist(updateCheckoutRow(workflow, athleteId, { status: 'failed', message: 'Please sign in again.' }))
      setBusyAthleteId(null)
      return
    }
    const response = await fetch('/api/mobile/family/offerings/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, 'Idempotency-Key': row.idempotencyKey },
      body: JSON.stringify({ offering_type: workflow.offeringType, offering_id: workflow.offeringId,
        organization_id: workflow.organizationId, athlete_profile_id: athleteId,
        occurrence_ids: workflow.occurrenceIds, idempotency_key: row.idempotencyKey }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message || 'Registration could not be prepared.'
      persist(updateCheckoutRow(workflow, athleteId, { status: 'failed', message }))
      setBusyAthleteId(null)
      return
    }
    const registrationId = String(payload.registration_id || '')
    const checkoutRecordId = String(payload.checkout_record_id || payload.subscription_record_id || registrationId)
    if (!payload.checkout_required) {
      persist(updateCheckoutRow(workflow, athleteId, { status: 'enrolled', registrationId, checkoutRecordId,
        message: 'Registration complete. No payment was required.' }))
      setBusyAthleteId(null)
      await onRefresh()
      return
    }
    const checkoutUrl = String(payload.checkout_url || '')
    if (!checkoutUrl) {
      persist(updateCheckoutRow(workflow, athleteId, { status: 'failed', registrationId, message: 'Secure checkout is unavailable.' }))
      setBusyAthleteId(null)
      return
    }
    const ready = updateCheckoutRow(workflow, athleteId, { status: 'checkout_ready', registrationId, checkoutRecordId,
      checkoutUrl, message: 'Ready to open this athlete’s secure checkout.' })
    persist(ready)
    setBusyAthleteId(null)
  }

  const openCheckout = (athleteId: string) => {
    if (!workflow || busyAthleteId) return
    const row = workflow.rows.find(item => item.athleteId === athleteId)
    if (!row?.checkoutUrl) return
    captureOfferingEvent('offering_checkout_started', { org_id: workflow.organizationId, offering_id: workflow.offeringId,
      offering_type: workflow.offeringType, billing_type: workflow.billingType, athlete_count: 1,
      occurrence_count: workflow.occurrenceIds.length })
    persist(updateCheckoutRow(workflow, athleteId, { status: 'payment_processing', message: 'Complete payment in Stripe.' }))
    window.location.assign(row.checkoutUrl)
  }

  const refresh = async () => {
    if (!workflow || busyAthleteId) return
    setBusyAthleteId('refresh')
    let next = workflow
    await Promise.all(workflow.rows.filter(row => row.registrationId && row.status === 'payment_processing').map(async row => {
      const response = await fetch(`/api/athlete/org-programs?athlete_profile_id=${encodeURIComponent(row.athleteId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      const program = (payload?.programs || []).find((item: any) => item.id === workflow.offeringId)
      if (['paid', 'active'].includes(String(program?.registration?.status || '').toLowerCase())) {
        next = updateCheckoutRow(next, row.athleteId, { status: 'enrolled', message: 'Payment confirmed and athlete enrolled.' })
      }
    }))
    persist(next)
    await onRefresh()
    setBusyAthleteId(null)
  }

  const useUpdatedDates = async () => {
    if (!workflow || !occurrenceIds.length || busyAthleteId) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const rows = await Promise.all(workflow.rows.map(async row => {
      if (['enrolled', 'payment_processing'].includes(row.status)) return row
      return { ...row, status: 'pending' as const, message: undefined, checkoutUrl: undefined,
        idempotencyKey: await stableAthleteCheckoutKey({ parentId: session.user.id, athleteId: row.athleteId,
          offeringId: offering.id, occurrenceIds }) }
    }))
    persist({ ...workflow, occurrenceIds: [...occurrenceIds].sort(), rows, updatedAt: new Date().toISOString() })
  }

  const summary = useMemo(() => checkoutSummary(workflow?.rows || []), [workflow])
  const nextPending = workflow?.rows.find(row => row.status === 'pending')
  const activeCheckout = workflow?.rows.some(row => ['preparing', 'checkout_ready'].includes(row.status))

  return <div className="mt-4 border-t border-[#dedbd7] pt-4">
    {!open ? <button type="button" onClick={() => { setOpen(true); captureOfferingEvent('offering_viewed', {
      org_id: offering.org_id, offering_id: offering.id, offering_type: offering.type || 'program',
    }) }} className="rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white">
      Register athlete(s)
    </button> : null}
    {open && !workflow ? <div className="rounded-2xl bg-[#f7f6f4] p-4">
      <p className="font-semibold">Choose athletes</p>
      <p className="mt-1 text-sm text-[#6b5f55]">Each athlete will have a separate checkout.</p>
      <div className="mt-3 space-y-2">{athletes.map(athlete => <label key={athlete.id} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={selected.includes(athlete.id)} onChange={() => setSelected(current => current.includes(athlete.id) ? current.filter(id => id !== athlete.id) : [...current, athlete.id])}/>
        {athlete.name}
      </label>)}</div>
      {!occurrenceIds.length ? <p className="mt-3 text-sm text-[#b80f0a]">Choose at least one date and time above.</p> : null}
      <button type="button" disabled={!selected.length || !occurrenceIds.length} onClick={() => void start()} className="mt-4 rounded-full bg-[#b80f0a] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Continue</button>
    </div> : null}
    {workflow ? <div className="rounded-2xl bg-[#f7f6f4] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">Athlete checkout progress</p><p className="text-xs text-[#6b5f55]">Each registration and payment is processed independently.</p></div>
        <button type="button" disabled={Boolean(busyAthleteId)} onClick={() => void refresh()} className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Refresh status</button></div>
      <div className="mt-3 space-y-2">{workflow.rows.map(row => <div key={row.athleteId} className="rounded-xl border bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{row.athleteName}</p><p className="text-xs text-[#6b5f55]">{statusLabel[row.status]}</p></div>
          <div className="flex gap-2">
            {['failed', 'cancelled'].includes(row.status) ? <button disabled={Boolean(busyAthleteId)} onClick={() => void prepare(row.athleteId)} className="rounded-full border border-[#b80f0a] px-3 py-1.5 text-xs font-semibold text-[#b80f0a] disabled:opacity-50">Retry</button> : null}
            {row.status === 'checkout_ready' ? <button disabled={Boolean(busyAthleteId)} onClick={() => openCheckout(row.athleteId)} className="rounded-full bg-[#191919] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Open checkout</button> : null}
          </div>
        </div>{row.message ? <p className="mt-2 text-xs text-[#6b5f55]">{row.message}</p> : null}
      </div>)}</div>
      <p className="mt-3 text-xs text-[#6b5f55]">Enrolled {summary.enrolled} · Pending {summary.pending + summary.preparing + summary.checkout_ready + summary.payment_processing} · Failed {summary.failed} · Cancelled {summary.cancelled}</p>
      {summary.failed > 0 ? <button type="button" disabled={Boolean(busyAthleteId) || !occurrenceIds.length}
        onClick={() => void useUpdatedDates()} className="mt-3 rounded-full border border-[#b80f0a] px-4 py-2 text-xs font-semibold text-[#b80f0a] disabled:opacity-50">
        Use updated date selections
      </button> : null}
      {nextPending && !activeCheckout ? <button type="button" disabled={Boolean(busyAthleteId)} onClick={() => void prepare(nextPending.athleteId)} className="mt-3 rounded-full bg-[#b80f0a] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {workflow.rows.some(row => row.status === 'enrolled' || row.status === 'payment_processing') ? `Continue to ${nextPending.athleteName}` : `Start with ${nextPending.athleteName}`}
      </button> : null}
      {!nextPending && summary.enrolled === workflow.rows.length ? <p className="mt-3 text-sm font-semibold text-green-700">All selected athletes are enrolled.</p> : null}
    </div> : null}
  </div>
}
