'use client'

import { useCallback, useEffect, useState } from 'react'
import CoachSidebar from '@/components/CoachSidebar'

type Plan = {
  id: string
  athlete_id: string
  athlete_name: string
  title: string
  description?: string | null
  content?: string | null
  status: string
  progress: string
}
type Athlete = { id: string; full_name: string }
type PlanForm = { athlete_id: string; title: string; description: string; content: string }

const emptyForm: PlanForm = { athlete_id: '', title: '', description: '', content: '' }

export default function CoachTrainingPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [form, setForm] = useState<PlanForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Omit<PlanForm, 'athlete_id'>>({ title: '', description: '', content: '' })
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/training-plans', { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setNotice(data.error || 'Unable to load training plans.')
    } else {
      setPlans(data.plans || [])
      setAthletes(data.available_athletes || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load])

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setNotice('')
    const response = await fetch('/api/training-plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setNotice(data.error || 'Unable to create plan.')
    else {
      setForm(emptyForm)
      setNotice('Training plan created.')
      await load()
    }
    setSaving(false)
  }

  const beginEdit = (plan: Plan) => {
    setEditingId(plan.id)
    setEditForm({ title: plan.title, description: plan.description || '', content: plan.content || '' })
    setNotice('')
  }

  const saveEdit = async (id: string) => {
    setSaving(true)
    setNotice('')
    const response = await fetch('/api/training-plans', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...editForm }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setNotice(data.error || 'Unable to update plan.')
    else {
      setEditingId(null)
      setNotice('Training plan updated.')
      await load()
    }
    setSaving(false)
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this training plan?')) return
    setNotice('')
    const response = await fetch(`/api/training-plans?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setNotice(data.error || 'Unable to delete plan.')
    else {
      setPlans((rows) => rows.filter((row) => row.id !== id))
      setNotice('Training plan deleted.')
    }
  }

  return <main className="page-shell"><div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10"><div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><CoachSidebar /><section>
    <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Coach portal</p><h1 className="display text-3xl font-semibold">Training plans</h1>
    <p className="mt-2 text-sm text-[#4a4a4a]">Create and edit plans here. Athletes see every saved change on web and iOS.</p>
    <form onSubmit={create} className="glass-card mt-6 grid gap-3 p-5">
      <h2 className="text-lg font-semibold">Create a plan</h2>
      <select required value={form.athlete_id} onChange={(event) => setForm({ ...form, athlete_id: event.target.value })} className="rounded-xl border p-3">
        <option value="">Select athlete</option>{athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.full_name}</option>)}
      </select>
      {!athletes.length && !loading && <p className="text-sm text-[#6b6b6b]">No athletes are available in the selected coach workspace.</p>}
      <input required placeholder="Plan title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded-xl border p-3" />
      <input placeholder="Short description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="rounded-xl border p-3" />
      <textarea placeholder="Plan details" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className="min-h-32 rounded-xl border p-3" />
      <button disabled={saving || !athletes.length} className="w-fit rounded-full bg-[#191919] px-5 py-2.5 font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Create plan'}</button>
    </form>
    {notice && <p className="mt-4 rounded-xl border border-[#e1e1e1] bg-white p-3 text-sm">{notice}</p>}
    <div className="mt-6 space-y-3">
      {plans.map((plan) => <article key={plan.id} className="glass-card p-5">
        {editingId === plan.id ? <div className="grid gap-3">
          <h2 className="font-semibold">Edit plan for {plan.athlete_name}</h2>
          <input required value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} className="rounded-xl border p-3" />
          <input value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} className="rounded-xl border p-3" placeholder="Short description" />
          <textarea value={editForm.content} onChange={(event) => setEditForm({ ...editForm, content: event.target.value })} className="min-h-32 rounded-xl border p-3" placeholder="Plan details" />
          <div className="flex flex-wrap gap-2">
            <button disabled={saving || !editForm.title.trim()} onClick={() => void saveEdit(plan.id)} className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save changes</button>
            <button onClick={() => setEditingId(null)} className="rounded-full border px-4 py-2 text-sm font-semibold">Cancel</button>
          </div>
        </div> : <>
          <div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold">{plan.title}</h2><p className="text-sm text-[#b80f0a]">{plan.athlete_name} · {plan.progress.replaceAll('_', ' ')}</p></div><div className="flex gap-3"><button onClick={() => beginEdit(plan)} className="text-sm font-semibold">Edit</button><button onClick={() => void remove(plan.id)} className="text-sm text-red-700">Delete</button></div></div>
          {plan.description && <p className="mt-3 text-sm text-[#4a4a4a]">{plan.description}</p>}{plan.content && <p className="mt-3 whitespace-pre-wrap text-sm">{plan.content}</p>}
        </>}
      </article>)}
      {!plans.length && !loading && <div className="glass-card p-6 text-sm text-[#4a4a4a]">No training plans yet.</div>}
      {loading && <div className="glass-card p-6 text-sm text-[#4a4a4a]">Loading training plans…</div>}
    </div>
  </section></div></div></main>
}
