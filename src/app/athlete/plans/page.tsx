'use client'

import { useCallback, useEffect, useState } from 'react'
import AthleteSidebar from '@/components/AthleteSidebar'

type Plan = { id: string; coach_name: string; title: string; description?: string | null; content?: string | null; status: string; progress: string }

export default function AthleteTrainingPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => { const response = await fetch('/api/training-plans', { cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok) setNotice(data.error || 'Unable to load plans.'); else setPlans(data.plans || []) }, [])
  useEffect(() => { void load() }, [load])
  const update = async (id: string, progress: string) => { setPlans((rows) => rows.map((row) => row.id === id ? { ...row, progress } : row)); const response = await fetch('/api/training-plans', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, progress }) }); if (!response.ok) { setNotice('Progress was not saved.'); await load() } }
  return <main className="page-shell"><div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10"><div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><AthleteSidebar /><section>
    <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Athlete portal</p><h1 className="display text-3xl font-semibold">Training plans</h1><p className="mt-2 text-sm text-[#4a4a4a]">Plans assigned by your coaches. Progress syncs with the mobile app.</p>
    {notice && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{notice}</p>}
    <div className="mt-6 space-y-4">{plans.map((plan) => <article key={plan.id} className="glass-card p-5"><h2 className="font-semibold">{plan.title}</h2><p className="text-sm text-[#b80f0a]">From {plan.coach_name}</p>{plan.description && <p className="mt-3 text-sm text-[#4a4a4a]">{plan.description}</p>}{plan.content && <p className="mt-3 whitespace-pre-wrap text-sm">{plan.content}</p>}<div className="mt-4 flex flex-wrap gap-2">{['not_started','in_progress','completed'].map((status) => <button key={status} onClick={() => void update(plan.id, status)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${plan.progress === status ? 'bg-[#191919] text-white' : 'bg-white'}`}>{status.replaceAll('_',' ')}</button>)}</div></article>)}{!plans.length && <div className="glass-card p-6 text-sm text-[#4a4a4a]">Your coaches have not assigned a training plan yet.</div>}</div>
  </section></div></div></main>
}
