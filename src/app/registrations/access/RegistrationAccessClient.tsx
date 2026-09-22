'use client'

import { useEffect, useState } from 'react'

type Registration = {
  id: string
  athlete_name: string
  status: string
  payment_status?: string | null
  amount_due_cents?: number | null
  created_at?: string | null
  org_enrollment_forms?: { title?: string | null } | Array<{ title?: string | null }> | null
  organizations?: { name?: string | null } | Array<{ name?: string | null }> | null
  guardian_approval?: { status: string; decided_at?: string | null } | null
}

const relatedName = (value: { name?: string | null } | Array<{ name?: string | null }> | null | undefined) => Array.isArray(value) ? value[0]?.name : value?.name
const formTitle = (value: { title?: string | null } | Array<{ title?: string | null }> | null | undefined) => Array.isArray(value) ? value[0]?.title : value?.title

export default function RegistrationAccessClient({ token }: { token: string }) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    const response = await fetch(`/api/registrations/access?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) { setError(payload?.error || 'Unable to open registrations.'); return }
    setEmail(payload.email || '')
    setRegistrations(payload.registrations || [])
  }
  useEffect(() => { load() }, [token])
  const decide = async (submissionId: string, decision: 'approved' | 'denied') => {
    const response = await fetch('/api/registrations/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, submission_id: submissionId, decision }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) { setError(payload?.error || 'Unable to save your decision.'); return }
    await load()
  }
  const cancel = async (submissionId: string) => {
    if (!window.confirm('Cancel this unpaid registration?')) return
    const response = await fetch('/api/registrations/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, submission_id: submissionId, action: 'cancel' }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) { setError(payload?.error || 'Unable to cancel registration.'); return }
    await load()
  }
  if (loading) return <p className="text-sm text-[#6b6b6b]">Loading registrations...</p>
  if (error) return <p className="rounded-2xl bg-red-50 p-4 text-sm text-[#b80f0a]">{error}</p>
  return <div><p className="text-sm text-[#6b6b6b]">Secure access for {email}</p><div className="mt-5 space-y-4">{registrations.map((item) => <article key={item.id} className="rounded-2xl border border-[#dcdcdc] p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#b80f0a]">{relatedName(item.organizations) || 'Organization'}</p><h2 className="mt-1 text-lg font-semibold">{formTitle(item.org_enrollment_forms) || 'Registration'}</h2><p className="mt-1 text-sm text-[#4a4a4a]">Athlete: {item.athlete_name}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[#f1f1f1] px-3 py-1">Registration: {item.status.replaceAll('_', ' ')}</span><span className="rounded-full bg-[#f1f1f1] px-3 py-1">Payment: {item.payment_status || 'unpaid'}</span></div>{item.guardian_approval?.status === 'pending' ? <div className="mt-5 rounded-xl bg-amber-50 p-4"><p className="text-sm font-semibold">Guardian approval required</p><p className="mt-1 text-xs text-[#6b6b6b]">Confirm whether this athlete may participate in this program.</p><div className="mt-3 flex gap-2"><button onClick={() => decide(item.id, 'approved')} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Approve registration</button><button onClick={() => decide(item.id, 'denied')} className="rounded-full border px-4 py-2 text-xs font-semibold text-[#b80f0a]">Deny</button></div></div> : item.guardian_approval ? <p className="mt-4 text-sm font-semibold capitalize">Guardian decision: {item.guardian_approval.status}</p> : null}{['pending','pending_guardian_approval'].includes(item.status) && item.payment_status !== 'paid' ? <button onClick={() => cancel(item.id)} className="mt-4 rounded-full border border-[#dcdcdc] px-4 py-2 text-xs font-semibold text-[#b80f0a]">Cancel registration</button> : null}</article>)}</div>{registrations.length === 0 ? <p className="mt-5 text-sm text-[#6b6b6b]">No registrations were found for this email.</p> : null}</div>
}
