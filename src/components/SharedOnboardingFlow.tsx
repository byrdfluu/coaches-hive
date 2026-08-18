'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ONBOARDING_STEPS, PRE_PAYWALL_STEP_IDS, onboardingPathForRole, type OnboardingAnswer, type OnboardingAnswers, type OnboardingRole, type OnboardingStep } from '@/lib/sharedOnboardingContract'

const destinationFor = (role: OnboardingRole) => role === 'org_director' ? '/org' : role === 'athlete' ? '/athlete/dashboard' : '/coach/dashboard'
const planRoleFor = (role: OnboardingRole) => role === 'org_director' ? 'org_admin' : 'coach'

export default function SharedOnboardingFlow({ expectedRole }: { expectedRole?: 'coach' | 'athlete' | 'org' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedStage = searchParams.get('stage')
  const [role, setRole] = useState<OnboardingRole | null>(null)
  const [answers, setAnswers] = useState<OnboardingAnswers>({})
  const [steps, setSteps] = useState<OnboardingStep[]>([])
  const [index, setIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const stage = requestedStage === 'pre' ? 'pre' : requestedStage === 'post' ? 'post' : 'full'

  useEffect(() => {
    const load = async () => {
      const response = await fetch('/api/onboarding/profile', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.role) { setError(data?.error || 'Unable to load onboarding.'); setLoading(false); return }
      const resolvedRole = data.role as OnboardingRole
      const roleMatches = !expectedRole || (expectedRole === 'org' ? resolvedRole === 'org_director' : expectedRole === 'athlete' ? resolvedRole === 'athlete' : resolvedRole === 'solo_coach' || resolvedRole === 'org_coach')
      if (!roleMatches) { router.replace(onboardingPathForRole(resolvedRole)); return }
      const all = ONBOARDING_STEPS[resolvedRole]
      const preIds = new Set(PRE_PAYWALL_STEP_IDS[resolvedRole])
      setRole(resolvedRole)
      setAnswers(data.answers || {})
      setSteps(stage === 'pre' ? all.filter((item) => preIds.has(item.id)) : stage === 'post' ? all.filter((item) => !preIds.has(item.id)) : all)
      setLoading(false)
    }
    void load()
  }, [expectedRole, router, stage])

  const current = steps[index]
  const answered = current ? answers[current.id] : undefined
  const canContinue = Boolean(current?.skippable || (Array.isArray(answered) ? answered.length : String(answered || '').trim()))
  const saveDraft = async (nextAnswers: OnboardingAnswers, prepaywallComplete = false) => {
    if (!role) return false
    const response = await fetch('/api/onboarding/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, answers: nextAnswers, prepaywall_complete: prepaywallComplete }) })
    return response.ok
  }
  const advance = async () => {
    if (!current || !canContinue) return
    setSaving(true); setError('')
    const ok = await saveDraft(answers)
    setSaving(false)
    if (!ok) { setError('Unable to save your answer. Try again.'); return }
    if (index + 1 >= steps.length) setReviewing(true); else setIndex((value) => value + 1)
  }
  const finish = async () => {
    if (!role) return
    setSaving(true); setError('')
    if (stage === 'pre') {
      const ok = await saveDraft(answers, true)
      setSaving(false)
      if (!ok) { setError('Unable to save onboarding. Try again.'); return }
      router.replace(`/select-plan?role=${planRoleFor(role)}`)
      return
    }
    const response = await fetch('/api/onboarding/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, answers, complete: true }) })
    const data = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) { setError(data?.error || 'Unable to complete onboarding.'); return }
    router.replace(destinationFor(role))
  }

  if (loading) return <main className="flex min-h-[70vh] items-center justify-center"><p>Loading onboarding…</p></main>
  if (error && !role) return <main className="flex min-h-[70vh] items-center justify-center px-6"><p className="text-[#b80f0a]">{error}</p></main>
  if (!role || !current) return null
  const title = role === 'org_director' ? 'Let’s personalize your organization' : stage === 'pre' ? 'Let’s personalize your experience' : 'Let’s complete your onboarding'

  if (!started) return <main className="page-shell flex min-h-[80vh] items-center justify-center px-5"><section className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-8 text-center shadow-sm"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#b80f0a]/10 text-2xl text-[#b80f0a]">✓</div><h1 className="mt-5 text-3xl font-semibold text-[#191919]">{title}</h1><p className="mt-3 text-[#666]">Answer a few questions so your profile and portal stay consistent across the Coaches Hive app and website.</p><p className="mt-5 rounded-2xl bg-[#f7f6f4] px-4 py-3 text-sm font-semibold">{stage === 'pre' ? 'About 1 minute' : 'About 6–8 minutes'}</p><button onClick={() => setStarted(true)} className="mt-6 w-full rounded-full bg-[#b80f0a] px-5 py-3 font-semibold text-white">Start onboarding</button></section></main>

  if (reviewing) return <main className="page-shell min-h-screen px-5 py-10"><section className="mx-auto max-w-2xl rounded-3xl border border-[#191919] bg-white p-7"><p className="text-xs font-bold uppercase tracking-[.25em] text-[#b80f0a]">Review your profile</p><h1 className="mt-2 text-3xl font-semibold">Here’s what we’ve got.</h1><div className="mt-6 divide-y rounded-2xl border">{steps.map((item) => <button key={item.id} onClick={() => { setIndex(steps.findIndex((value) => value.id === item.id)); setReviewing(false) }} className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left"><span><span className="block text-xs text-[#777]">{item.message}</span><span className="mt-1 block font-medium">{Array.isArray(answers[item.id]) ? (answers[item.id] as string[]).join(', ') : String(answers[item.id] || 'Not answered')}</span></span><span className="text-sm text-[#b80f0a]">Edit</span></button>)}</div>{error && <p className="mt-4 text-sm text-[#b80f0a]">{error}</p>}<button disabled={saving} onClick={finish} className="mt-6 w-full rounded-full bg-[#b80f0a] px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : stage === 'pre' ? 'Continue to plans' : 'Go to my dashboard'}</button></section></main>

  return <main className="page-shell min-h-screen px-5 py-8"><section className="mx-auto max-w-2xl"><div className="flex items-center justify-between text-sm"><button disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} className="disabled:opacity-30">← Back</button><span>{index + 1} of {steps.length}</span></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-[#ead8d6]"><div className="h-full bg-[#b80f0a] transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div><div className="mt-8 flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#b80f0a] text-white">⚡</span><div className="rounded-2xl rounded-tl-sm bg-white px-5 py-4 text-lg shadow-sm">{current.message}</div></div><div className="mt-8 rounded-3xl border border-[#ddd] bg-white p-5"><StepField step={current} value={answered} onChange={(value) => setAnswers((existing) => ({ ...existing, [current.id]: value }))} /><div className="mt-5 flex items-center justify-between">{current.skippable ? <button onClick={() => { setAnswers((existing) => { const next = { ...existing }; delete next[current.id]; return next }); if (index + 1 >= steps.length) setReviewing(true); else setIndex((value) => value + 1) }} className="text-sm text-[#666]">Skip</button> : <span />}<button disabled={!canContinue || saving} onClick={advance} className="rounded-full bg-[#b80f0a] px-7 py-3 font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Next'}</button></div>{error && <p className="mt-3 text-sm text-[#b80f0a]">{error}</p>}</div></section></main>
}

function StepField({ step, value, onChange }: { step: OnboardingStep; value?: OnboardingAnswer; onChange: (value: OnboardingAnswer) => void }) {
  const values = Array.isArray(value) ? value : []
  const [tag, setTag] = useState('')
  if (step.type === 'textarea') return <textarea autoFocus rows={5} value={String(value || '')} onChange={(event) => onChange(event.target.value)} placeholder={step.placeholder} className="w-full rounded-2xl border px-4 py-3 outline-none focus:border-[#b80f0a]" />
  if (step.type === 'text' || step.type === 'date') return <input autoFocus type={step.type === 'date' ? 'date' : 'text'} value={String(value || '')} onChange={(event) => onChange(event.target.value)} placeholder={step.placeholder} className="w-full rounded-2xl border px-4 py-3 outline-none focus:border-[#b80f0a]" />
  if (step.type === 'tags') return <div><div className="flex flex-wrap gap-2">{values.map((item) => <button type="button" key={item} onClick={() => onChange(values.filter((value) => value !== item))} className="rounded-full bg-[#b80f0a] px-3 py-1.5 text-sm text-white">{item} ×</button>)}</div><div className="mt-3 flex gap-2"><input value={tag} onChange={(event) => setTag(event.target.value)} placeholder={step.placeholder || 'Add an item'} className="min-w-0 flex-1 rounded-2xl border px-4 py-3" /><button type="button" onClick={() => { const next = tag.trim(); if (next) onChange([...values, next]); setTag('') }} className="rounded-full border px-4 font-semibold">Add</button></div></div>
  return <div className="grid gap-2 sm:grid-cols-2">{step.options?.map((option) => { const selected = step.type === 'multi' ? values.includes(option) : value === option; return <button type="button" key={option} onClick={() => onChange(step.type === 'multi' ? (selected ? values.filter((item) => item !== option) : [...values, option]) : option)} className={`rounded-full border px-4 py-3 text-sm font-medium ${selected ? 'border-[#b80f0a] bg-[#b80f0a] text-white' : 'bg-white text-[#191919]'}`}>{option}</button> })}</div>
}
