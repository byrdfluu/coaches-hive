'use client'

import { useCallback, useEffect, useState } from 'react'
import CoachSidebar from '@/components/CoachSidebar'
import { createSafeClientComponentClient } from '@/lib/supabaseHelpers'

type Plan = { id: string; athlete_id: string; athlete_name: string; title: string; description?: string | null; content?: string | null; status: string; progress: string }
type Athlete = { id: string; full_name: string | null }

export default function CoachTrainingPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [form, setForm] = useState({ athlete_id: '', title: '', description: '', content: '' })
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    const [planResponse] = await Promise.all([fetch('/api/training-plans', { cache: 'no-store' })])
    const planData = await planResponse.json().catch(() => ({})); setPlans(planData.plans || [])
    const supabase = createSafeClientComponentClient()
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return
    const { data: links } = await supabase.from('coach_athlete_links').select('athlete_id').eq('coach_id', user.user.id).eq('status', 'active')
    const ids = (links || []).map((row) => row.athlete_id)
    if (!ids.length) return setAthletes([])
    const { data } = await supabase.from('athlete_profiles').select('id,full_name').in('owner_user_id', ids).eq('is_primary', true)
    setAthletes((data || []) as Athlete[])
  }, [])
  useEffect(() => { void load() }, [load])
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setNotice('')
    const response = await fetch('/api/training-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setNotice(data.error || 'Unable to create plan.')
    setForm({ athlete_id: '', title: '', description: '', content: '' }); setNotice('Training plan created.'); await load()
  }
  const remove = async (id: string) => { if (!window.confirm('Delete this training plan?')) return; await fetch(`/api/training-plans?id=${id}`, { method: 'DELETE' }); await load() }
  return <main className="page-shell"><div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10"><div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><CoachSidebar /><section>
    <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Coach portal</p><h1 className="display text-3xl font-semibold">Training plans</h1>
    <p className="mt-2 text-sm text-[#4a4a4a]">Create plans here and athletes will see them immediately in both web and iOS.</p>
    <form onSubmit={create} className="glass-card mt-6 grid gap-3 p-5">
      <h2 className="text-lg font-semibold">Create a plan</h2>
      <select required value={form.athlete_id} onChange={(e) => setForm({ ...form, athlete_id: e.target.value })} className="rounded-xl border p-3"><option value="">Select athlete</option>{athletes.map((a) => <option key={a.id} value={a.id}>{a.full_name || 'Athlete'}</option>)}</select>
      <input required placeholder="Plan title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-xl border p-3" />
      <input placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl border p-3" />
      <textarea placeholder="Plan details" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="min-h-32 rounded-xl border p-3" />
      <button className="w-fit rounded-full bg-[#191919] px-5 py-2.5 font-semibold text-white">Create plan</button>{notice && <p className="text-sm">{notice}</p>}
    </form>
    <div className="mt-6 space-y-3">{plans.map((plan) => <article key={plan.id} className="glass-card p-5"><div className="flex justify-between gap-4"><div><h2 className="font-semibold">{plan.title}</h2><p className="text-sm text-[#b80f0a]">{plan.athlete_name} · {plan.progress.replace('_',' ')}</p></div><button onClick={() => void remove(plan.id)} className="text-sm text-red-700">Delete</button></div>{plan.description && <p className="mt-3 text-sm text-[#4a4a4a]">{plan.description}</p>}{plan.content && <p className="mt-3 whitespace-pre-wrap text-sm">{plan.content}</p>}</article>)}{!plans.length && <div className="glass-card p-6 text-sm text-[#4a4a4a]">No training plans yet.</div>}</div>
  </section></div></div></main>
}
