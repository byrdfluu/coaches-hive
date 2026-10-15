'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AthleteSidebar from '@/components/AthleteSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import { useAthleteProfile } from '@/components/AthleteProfileContext'
import MultiAthleteOfferingCheckout from '@/components/MultiAthleteOfferingCheckout'

type Program = {
  id: string
  title: string
  description: string | null
  duration_label: string | null
  coach_name: string
  exercise_count: number
  thumbnail_path: string | null
  thumbnail_url: string | null
}

type AssignedProgram = {
  id: string
  org_id: string
  name: string
  type: string
  description?: string | null
  start_date?: string | null
  end_date?: string | null
  location?: string | null
  price_cents: number
  fulfillment_mode?: 'series' | 'per_occurrence' | 'credit_membership' | 'free'
  price_per_occurrence?: number | null
  credits_per_period?: number | null
  billing_interval?: 'month' | 'year' | null
  billing_type?: 'one_time' | 'recurring' | null
  credit_expiration_days?: number | null
  cancellation_cutoff_hours?: number | null
  payment_plan_enabled?: boolean
  payment_plan_installments?: number | null
  payment_plan_frequency?: string | null
  payment_plan_first_payment_cents?: number | null
  organization_name: string
  registration?: { id: string; status: string; registered_at?: string | null; occurrence_selections?: Array<{ id: string; occurrence_id: string; status: string; credit_returned: boolean; cancelled_at?: string | null; cancellation_reason?: string | null }> } | null
  credit_membership?: { id: string; status: string; subscription_id?: string | null; subscription_status?: string | null; access_allowed?: boolean; cancel_at_period_end?: boolean; current_period_end?: string | null; next_expiration?: string | null; credits_issued: number; credits_spent: number; credits_remaining: number; current_cycle?: { period_start: string; period_end: string; credits_issued: number; credits_spent: number; credits_remaining: number } | null } | null
  occurrences?: Array<{ id: string; starts_at: string; ends_at: string; timezone?: string | null; location?: string | null; field_or_court?: string | null; capacity?: number | null; available_spots?: number | null }>
}

export default function AthleteProgramsPage() {
  const { activeSubProfileId, activeAthleteLabel, subProfiles } = useAthleteProfile()
  const [programs, setPrograms] = useState<Program[]>([])
  const [assignedPrograms, setAssignedPrograms] = useState<AssignedProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [savedProgramIds, setSavedProgramIds] = useState<Set<string>>(new Set())
  const [savingProgramId, setSavingProgramId] = useState<string | null>(null)
  const [selectedOccurrences, setSelectedOccurrences] = useState<Record<string,string[]>>({})
  const [editingDatesId, setEditingDatesId] = useState<string | null>(null)
  const [mutatingSelectionId, setMutatingSelectionId] = useState<string | null>(null)
  const [replacementBySelection, setReplacementBySelection] = useState<Record<string,string>>({})
  const [openingBillingId, setOpeningBillingId] = useState<string | null>(null)

  const errorMessage = (payload: any, fallback: string) => typeof payload?.error === 'string'
    ? payload.error : payload?.error?.message || fallback

  const reloadAssignedPrograms = async () => {
    if (!activeSubProfileId) return []
    const response = await fetch(`/api/athlete/org-programs?athlete_profile_id=${encodeURIComponent(activeSubProfileId)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    const next = response.ok ? payload?.programs ?? [] : []
    if (response.ok) setAssignedPrograms(next)
    return next as AssignedProgram[]
  }

  useEffect(() => {
    let active = true
    if (!activeSubProfileId) return () => { active = false }
    Promise.all([
      fetch(`/api/athlete/programs?athlete_profile_id=${encodeURIComponent(activeSubProfileId)}`, { cache: 'no-store' }).then((res) => res.ok ? res.json() : null),
      fetch(`/api/athlete/org-programs?athlete_profile_id=${encodeURIComponent(activeSubProfileId)}`, { cache: 'no-store' })
        .then((res) => res.ok ? res.json() : null),
      fetch(`/api/athlete/saved-programs?athlete_profile_id=${encodeURIComponent(activeSubProfileId)}`, { cache: 'no-store' })
        .then((res) => res.ok ? res.json() : null),
    ])
      .then(([trainingData, assignedData, savedData]) => {
        if (!active) return
        setPrograms(trainingData?.programs ?? [])
        setAssignedPrograms(assignedData?.programs ?? [])
        setSavedProgramIds(new Set(Array.isArray(savedData?.program_ids) ? savedData.program_ids : []))
        setLoading(false)
      })
      .catch(() => { if (active) { setNotice('Unable to load programs. Please try again.'); setLoading(false) } })
    return () => { active = false }
  }, [activeSubProfileId])

  const toggleSavedProgram = async (programId: string) => {
    if (!activeSubProfileId || savingProgramId) return
    const wasSaved = savedProgramIds.has(programId)
    setSavingProgramId(programId)
    setNotice('')
    const response = await fetch('/api/athlete/saved-programs', {
      method: wasSaved ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program_id: programId, athlete_profile_id: activeSubProfileId }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setNotice(payload?.error || 'Unable to update saved programs.')
      setSavingProgramId(null)
      return
    }
    setSavedProgramIds((current) => {
      const next = new Set(current)
      if (wasSaved) next.delete(programId)
      else next.add(programId)
      return next
    })
    setSavingProgramId(null)
  }

  const registerForProgram = async (program: AssignedProgram, paymentPlan = false) => {
    if (!activeSubProfileId) return
    setRegisteringId(program.id)
    setNotice('')
    const response = await fetch('/api/athlete/org-programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program_id: program.id, athlete_profile_id: activeSubProfileId, payment_plan: paymentPlan, occurrence_ids: selectedOccurrences[program.id] || [] }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const refreshed = await reloadAssignedPrograms()
      const freshProgram = refreshed.find(item => item.id === program.id)
      const unavailable = (selectedOccurrences[program.id] || []).map(id => freshProgram?.occurrences?.find(item => item.id === id))
        .filter(item => item && item.available_spots === 0)
      setNotice(unavailable.length
        ? `${unavailable.map(item => new Date(item!.starts_at).toLocaleString()).join(', ')} is now full. Your other selections are still selected; choose a replacement.`
        : errorMessage(payload, 'Unable to register for this program.'))
      setRegisteringId(null)
      return
    }
    if (payload.checkout_required) {
      const idempotencyKey = crypto.randomUUID()
      const recurring = payload.checkout_type === 'recurring_program'
      const checkoutResponse = await fetch(recurring ? '/api/mobile/offerings/recurring-checkout' : '/api/mobile/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(recurring ? {
          offering_type: 'program',
          offering_id: payload.offering_id || program.id,
          organization_id: payload.organization_id || program.org_id,
          athlete_profile_id: activeSubProfileId,
          registration_id: payload.registration.id,
          idempotency_key: idempotencyKey,
        } : {
          type: payload.checkout_type || 'program',
          record_id: payload.checkout_record_id || payload.registration.id,
          athlete_profile_id: activeSubProfileId,
          idempotency_key: idempotencyKey,
        }),
      })
      const checkout = await checkoutResponse.json().catch(() => ({}))
      if (checkoutResponse.ok && checkout.checkout_url) {
        window.location.assign(checkout.checkout_url)
        return
      }
      setNotice(errorMessage(checkout, 'Unable to start secure checkout.'))
    } else {
      setAssignedPrograms((current) => current.map((item) => item.id === program.id
        ? { ...item, registration: payload.registration, ...(payload.booked && item.credit_membership ? { credit_membership: { ...item.credit_membership, credits_spent: item.credit_membership.credits_spent + (selectedOccurrences[item.id]?.length || 0), credits_remaining: Math.max(0, item.credit_membership.credits_remaining - (selectedOccurrences[item.id]?.length || 0)) } } : {}) }
        : item))
      if (payload.booked) setSelectedOccurrences((current) => ({ ...current, [program.id]: [] }))
      setNotice(payload.booked ? `Dates booked for ${activeAthleteLabel}.` : `${activeAthleteLabel} is registered.`)
    }
    setRegisteringId(null)
  }

  const openBillingPortal = async (subscriptionId: string) => {
    if (openingBillingId) return
    setOpeningBillingId(subscriptionId)
    const response = await fetch('/api/mobile/offerings/billing-portal', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription_id: subscriptionId }) })
    const payload = await response.json().catch(() => ({}))
    if (response.ok && payload.portal_url) window.location.assign(payload.portal_url)
    else { setNotice(errorMessage(payload, 'Unable to open billing management.')); setOpeningBillingId(null) }
  }

  const updateBookedDate = async (program: AssignedProgram, selectionId: string, action: 'cancel'|'reschedule') => {
    if (mutatingSelectionId) return
    const replacementId = replacementBySelection[selectionId]
    if (action === 'reschedule' && !replacementId) return setNotice('Choose a replacement date and time.')
    if (action === 'cancel') {
      const selected = program.registration?.occurrence_selections?.find(item => item.id === selectionId)
      const occurrence = program.occurrences?.find(item => item.id === selected?.occurrence_id)
      const cutoff = Number(program.cancellation_cutoff_hours || 24)
      const timely = Boolean(occurrence) && Date.now() <= new Date(occurrence!.starts_at).getTime() - cutoff * 60 * 60 * 1000
      const result = timely ? 'Canceling now returns 1 credit.' : 'The cancellation cutoff has passed, so this credit will not be returned.'
      if (!window.confirm(`${result}\n\nCancel this date?`)) return
    }
    setMutatingSelectionId(selectionId)
    setNotice('')
    const response = await fetch('/api/athlete/offering-occurrences', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, selection_id: selectionId, replacement_occurrence_id: replacementId,
        reason: action === 'cancel' ? 'Cancelled by family' : 'Changed by family' }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setNotice(errorMessage(payload, `Unable to ${action} this date.`))
    else {
      const returned = action === 'cancel' ? payload.credit_returned : payload.result?.credit_returned
      setNotice(action === 'cancel'
        ? returned ? 'Date cancelled. One credit was returned.' : 'Date cancelled after the cutoff; no credit was returned.'
        : returned ? 'Date changed. The original credit was returned and applied to the new date.' : 'Date changed successfully.')
      setSelectedOccurrences(current => ({ ...current, [program.id]: [] }))
      await reloadAssignedPrograms()
    }
    setMutatingSelectionId(null)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="min-w-0 space-y-6">
            <header>
              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Parent & Athlete Portal</p>
              <h1 className="display text-3xl font-semibold text-[#191919]">Offerings</h1>
              <p className="mt-1 text-sm text-[#6b5f55]">Eligible activities, dates, registrations, and purchases for {activeAthleteLabel}.</p>
            </header>

            {notice && <div className="rounded-2xl border border-[#d6d1cc] bg-white px-4 py-3 text-sm text-[#4a4a4a]">{notice}</div>}

            {loading ? (
              <LoadingState label="Loading programs…" />
            ) : programs.length === 0 && assignedPrograms.length === 0 ? (
              <EmptyState
                title="No programs yet."
                description="Assigned organization programs and purchased training programs will appear here."
                action={
                  <Link
                    href="/athlete/marketplace"
                    className="inline-flex items-center rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Browse marketplace
                  </Link>
                }
              />
            ) : null}

            {!loading && assignedPrograms.length > 0 && (
              <section>
                <h2 className="display text-2xl font-semibold text-[#191919]">Organization programs</h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  {assignedPrograms.map((program) => {
                    const registered = ['paid', 'confirmed', 'active'].includes(String(program.registration?.status || ''))
                    const creditProduct = program.fulfillment_mode === 'credit_membership'
                    const activeCredits = creditProduct && program.credit_membership?.access_allowed === true
                    const selectedCount = (selectedOccurrences[program.id] || []).length
                    const selections = program.registration?.occurrence_selections || []
                    const activeSelections = selections.filter(selection => ['reserved', 'attended', 'no_show'].includes(selection.status))
                    const occurrenceById = new Map((program.occurrences || []).map(occurrence => [occurrence.id, occurrence]))
                    return (
                      <article key={program.id} className="glass-card border border-[#191919] bg-white p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">{program.type}</p>
                        <h3 className="mt-2 text-lg font-semibold text-[#191919]">{program.name}</h3>
                        <p className="mt-1 text-sm text-[#6b5f55]">{program.organization_name}</p>
                        {program.description && <p className="mt-3 line-clamp-3 text-sm text-[#4a4a4a]">{program.description}</p>}
                        <div className="mt-3 space-y-1 text-xs text-[#6b5f55]">
                          {program.start_date && <p>{new Date(`${program.start_date}T00:00:00`).toLocaleDateString()}</p>}
                          {program.location && <p>{program.location}</p>}
                          <p>{program.price_cents === 0 ? 'Free' : `$${(program.price_cents / 100).toFixed(2)}`}</p>
                          {creditProduct && <p>{program.credits_per_period || 0} credits {program.billing_type === 'recurring' ? `per ${program.billing_interval || 'month'}` : `valid for ${program.credit_expiration_days || 365} days`}</p>}
                        </div>
                        {program.credit_membership && <div className="mt-3 rounded-xl bg-[#f7f6f4] p-3 text-sm"><p className="font-semibold">{program.credit_membership.credits_remaining} of {program.credit_membership.credits_issued} credits remaining</p><p className="mt-1 text-xs text-[#6b5f55]">Spent {program.credit_membership.credits_spent}{program.credit_membership.current_cycle ? ` · Paid period ${new Date(program.credit_membership.current_cycle.period_start).toLocaleDateString()}–${new Date(program.credit_membership.current_cycle.period_end).toLocaleDateString()}` : ''}</p>{program.credit_membership.cancel_at_period_end && program.credit_membership.next_expiration ? <p className="mt-2 font-semibold text-amber-800">Cancellation takes effect {new Date(program.credit_membership.next_expiration).toLocaleDateString()}. Current paid-period access remains available until then.</p> : null}{!program.credit_membership.access_allowed && program.credit_membership.status !== 'pending' ? <div className="mt-2"><p className="font-semibold text-[#b80f0a]">Payment required. Date selection and credit spending are unavailable.</p>{program.credit_membership.subscription_id ? <button type="button" disabled={openingBillingId===program.credit_membership.subscription_id} onClick={()=>void openBillingPortal(program.credit_membership!.subscription_id!)} className="mt-2 rounded-full border border-[#b80f0a] px-3 py-1.5 text-xs font-semibold text-[#b80f0a]">{openingBillingId===program.credit_membership.subscription_id?'Opening…':'Update payment method or retry payment'}</button>:<Link href="/athlete/refunds" className="mt-2 inline-block text-xs font-semibold text-[#b80f0a]">Manage billing</Link>}</div>:null}</div>}
                        {(program.occurrences||[]).length && (!registered || editingDatesId === program.id) ? <fieldset className="mt-3 space-y-2"><legend className="text-sm font-semibold">{activeCredits ? 'Choose Dates' : 'Select one or more dates/times'}</legend>{program.occurrences!.filter(occurrence => !activeSelections.some(selection => selection.occurrence_id === occurrence.id)).map(occurrence=>{const checked=(selectedOccurrences[program.id]||[]).includes(occurrence.id);const limit=creditProduct ? Number(program.credit_membership?.credits_remaining ?? program.credits_per_period ?? 0) : Infinity;return <label key={occurrence.id} className="flex gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={checked} disabled={occurrence.available_spots===0 || (!checked && selectedCount >= limit)} onChange={()=>setSelectedOccurrences(current=>({...current,[program.id]:checked?(current[program.id]||[]).filter(id=>id!==occurrence.id):[...(current[program.id]||[]),occurrence.id]}))}/><span>{new Date(occurrence.starts_at).toLocaleString()} – {new Date(occurrence.ends_at).toLocaleTimeString()} · {occurrence.timezone||''} · {occurrence.location||program.location||'Location TBD'}{occurrence.field_or_court?` · ${occurrence.field_or_court}`:''}{occurrence.available_spots==null?'':` · ${occurrence.available_spots} spots`}</span></label>})}</fieldset>:null}
                        {(selectedOccurrences[program.id]||[]).length>0?<div className="mt-3 rounded-lg bg-[#f7f6f4] p-3 text-sm">{program.fulfillment_mode==='per_occurrence'?`$${Number(program.price_per_occurrence||0).toFixed(2)} × ${selectedOccurrences[program.id].length} dates = $${(Number(program.price_per_occurrence||0)*selectedOccurrences[program.id].length).toFixed(2)}`:program.fulfillment_mode==='free'?'No checkout required':program.fulfillment_mode==='credit_membership'?`${selectedOccurrences[program.id].length} credits will be used`:`One registration — ${selectedOccurrences[program.id].length} dates included`}</div>:null}
                        <MultiAthleteOfferingCheckout offering={program} athletes={subProfiles}
                          activeAthleteId={activeSubProfileId} occurrenceIds={selectedOccurrences[program.id] || []}
                          onRefresh={async()=>{ await reloadAssignedPrograms() }}/>
                        {(registered || activeCredits) ? <button
                            type="button"
                            disabled={registeringId === program.id || (creditProduct ? selectedCount === 0 || Number(program.credit_membership?.credits_remaining || 0) < selectedCount : true)}
                            onClick={() => void registerForProgram(program)}
                            className="mt-4 rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50"
                          >
                            {registeringId === program.id ? 'Saving dates…' : activeCredits ? 'Book selected dates' : 'Registered'}
                          </button> : null}
                        {activeCredits && editingDatesId !== program.id ? <button type="button" onClick={() => setEditingDatesId(program.id)} className="ml-2 mt-4 rounded-full border border-[#191919] px-5 py-2.5 text-sm font-semibold">Choose Dates</button> : null}
                        {selections.length ? <div className="mt-4 space-y-2"><div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Your dates</h4><Link href="/athlete/credits" className="text-xs font-semibold text-[#b80f0a]">View credit history</Link></div>{selections.map(selection=>{const occurrence=occurrenceById.get(selection.occurrence_id);const cutoffHours=Number(program.cancellation_cutoff_hours||24);const timely=occurrence?Date.now()<=new Date(occurrence.starts_at).getTime()-cutoffHours*60*60*1000:false;return <div key={selection.id} className="rounded-xl border bg-[#fafafa] p-3 text-sm"><p className="font-medium">{occurrence ? `${new Date(occurrence.starts_at).toLocaleString()} · ${occurrence.location || program.location || 'Location TBD'}` : `Occurrence ${selection.occurrence_id}`}</p><p className="mt-1 text-xs capitalize text-[#6b5f55]">{selection.status.replaceAll('_',' ')}{selection.credit_returned ? ' · Credit returned' : selection.status === 'late_cancel' ? ' · No credit returned' : ''}</p>{selection.cancellation_reason ? <p className="mt-1 text-xs text-[#6b5f55]">{selection.cancellation_reason}</p> : null}{selection.status==='reserved' ? <><p className={`mt-2 text-xs font-semibold ${timely?'text-green-700':'text-amber-800'}`}>{timely?'Canceling now returns 1 credit.':'The cancellation cutoff has passed, so this credit will not be returned.'}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={mutatingSelectionId===selection.id} onClick={()=>void updateBookedDate(program,selection.id,'cancel')} className="rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50">Cancel</button><select value={replacementBySelection[selection.id]||''} onChange={event=>setReplacementBySelection(current=>({...current,[selection.id]:event.target.value}))} className="rounded-full border px-3 py-1 text-xs"><option value="">Change to…</option>{(program.occurrences||[]).filter(item=>item.id!==selection.occurrence_id&&item.available_spots!==0&&!activeSelections.some(active=>active.occurrence_id===item.id)).map(item=><option key={item.id} value={item.id}>{new Date(item.starts_at).toLocaleString()}</option>)}</select><button type="button" disabled={mutatingSelectionId===selection.id||!replacementBySelection[selection.id]} onClick={()=>void updateBookedDate(program,selection.id,'reschedule')} className="rounded-full bg-[#191919] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Change date</button></div></>:null}</div>})}</div>:null}
                        {program.payment_plan_enabled
                          && Number(program.payment_plan_installments || 0) > 1
                          && Number(program.payment_plan_first_payment_cents || 0) > 0
                          && !program.registration ? (
                            <button
                              type="button"
                              disabled={registeringId === program.id}
                              onClick={() => void registerForProgram(program, true)}
                              className="ml-2 mt-4 rounded-full border border-[#b80f0a] px-5 py-2.5 text-sm font-semibold text-[#b80f0a] disabled:opacity-50"
                            >
                              Pay in installments
                            </button>
                          ) : null}
                        <button
                          type="button"
                          disabled={savingProgramId === program.id}
                          onClick={() => void toggleSavedProgram(program.id)}
                          className="ml-2 mt-4 rounded-full border border-[#191919] px-5 py-2.5 text-sm font-semibold text-[#191919] disabled:opacity-50"
                        >
                          {savingProgramId === program.id ? 'Saving…' : savedProgramIds.has(program.id) ? 'Remove saved' : 'Save program'}
                        </button>
                        {program.payment_plan_enabled
                          && Number(program.payment_plan_installments || 0) > 1
                          && Number(program.payment_plan_first_payment_cents || 0) > 0 ? (
                            <p className="mt-3 text-xs text-[#6b5f55]">
                              {program.payment_plan_installments} payments · ${(Number(program.payment_plan_first_payment_cents) / 100).toFixed(2)} due today · {String(program.payment_plan_frequency || 'monthly')}
                            </p>
                          ) : null}
                      </article>
                    )
                  })}
                </div>
              </section>
            )}

            {!loading && programs.length > 0 && (
              <section>
                <h2 className="display text-2xl font-semibold text-[#191919]">Training programs</h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {programs.map((program) => (
                  <div
                    key={program.id}
                    className="glass-card flex flex-col overflow-hidden border border-[#191919] bg-white"
                  >
                    {program.thumbnail_url ? (
                      <img
                        src={program.thumbnail_url}
                        alt={program.title}
                        className="h-40 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center bg-[#f5f5f5] text-4xl">
                        🏋️
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <p className="font-semibold text-[#191919]">{program.title}</p>
                      <p className="mt-0.5 text-xs text-[#6b6b6b]">by {program.coach_name}</p>
                      {program.duration_label && (
                        <p className="mt-1 text-xs text-[#6b6b6b]">{program.duration_label}</p>
                      )}
                      <p className="mt-1 text-xs text-[#6b6b6b]">
                        {program.exercise_count} exercise{program.exercise_count !== 1 ? 's' : ''}
                      </p>
                      {program.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-[#4a4a4a]">{program.description}</p>
                      )}
                      <div className="mt-4">
                        <Link
                          href={`/athlete/programs/${program.id}?athlete_profile_id=${encodeURIComponent(activeSubProfileId || '')}`}
                          className="rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-80"
                        >
                          Start training →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
