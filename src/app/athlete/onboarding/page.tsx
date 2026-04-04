'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type Task = {
  id: string
  title: string
  description: string
  done: boolean
  action?: { label: string; href: string }
}

export default function AthleteOnboardingPage() {
  const supabase = createClientComponentClient()
  const [sessionCount, setSessionCount] = useState(0)
  const [practicePlansCount, setPracticePlansCount] = useState(0)
  const [familyReady, setFamilyReady] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      const reviewPromise = userId
        ? supabase.from('coach_reviews').select('id').eq('athlete_id', userId).limit(1)
        : Promise.resolve({ data: [], error: null })
      const emergencyContactsPromise = fetch('/api/emergency-contacts')
      const [sessionsRes, plansRes, emergencyRes, reviewRes, profileRes] = await Promise.all([
        fetch('/api/sessions'),
        fetch('/api/practice-plans'),
        emergencyContactsPromise,
        reviewPromise,
        userId
          ? supabase
              .from('profiles')
              .select('guardian_name, guardian_email, guardian_phone, account_owner_type')
              .eq('id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      const sessionsPayload = sessionsRes.ok ? await sessionsRes.json() : null
      const plansPayload = plansRes.ok ? await plansRes.json() : null
      const emergencyPayload = emergencyRes.ok ? await emergencyRes.json() : null
      if (!active) return
      setSessionCount((sessionsPayload?.sessions || []).length)
      setPracticePlansCount((plansPayload?.plans || []).length)
      const contacts = Array.isArray(emergencyPayload?.contacts) ? emergencyPayload.contacts : []
      const hasEmergencyContact = contacts.some((contact: { name?: string; relationship?: string; email?: string; phone?: string }) =>
        Boolean(contact?.name && contact?.relationship && (contact?.email || contact?.phone))
      )
      const profile = (profileRes.data || null) as {
        guardian_name?: string | null
        guardian_email?: string | null
        guardian_phone?: string | null
        account_owner_type?: string | null
      } | null
      const hasGuardianInfo = Boolean(
        profile?.guardian_name && profile?.guardian_email && profile?.guardian_phone
      )
      const ownerType = String(profile?.account_owner_type || '').trim().toLowerCase()
      setFamilyReady(hasEmergencyContact && (ownerType === 'athlete_adult' || hasGuardianInfo))
      const localReviewed = typeof window !== 'undefined'
        && window.localStorage.getItem('ch_reviewed_athlete_v1') === '1'
      setReviewed(reviewRes.error ? localReviewed : ((reviewRes.data as Array<{ id: string }> | null) || []).length > 0)
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [supabase])

  const tasks: Task[] = useMemo(() => [
    {
      id: 'first-session',
      title: 'Book your first session',
      description: 'Pick a coach and lock in your first training session.',
      done: sessionCount > 0,
      action: { label: 'Book session', href: '/athlete/calendar' },
    },
    {
      id: 'practice-plan',
      title: 'Start a training plan',
      description: 'Save a plan or product to organize your progress.',
      done: practicePlansCount > 0,
      action: { label: 'Browse plans', href: '/athlete/marketplace' },
    },
    {
      id: 'family-safety',
      title: 'Add family & safety info',
      description: 'Save guardian details and emergency contacts so approvals and urgent updates work correctly.',
      done: familyReady,
      action: { label: 'Open family settings', href: '/athlete/settings#family' },
    },
    {
      id: 'leave-review',
      title: 'Leave your first review',
      description: 'Share feedback after a completed session.',
      done: reviewed,
      action: { label: 'Write review', href: '/athlete/dashboard?review=1' },
    },
  ], [familyReady, practicePlansCount, reviewed, sessionCount])

  useEffect(() => {
    if (loading) return
    const sync = async () => {
      const doneIds = tasks.filter((task) => task.done).map((task) => task.id)
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'athlete',
          completed_steps: doneIds,
          total_steps: tasks.length,
        }),
      })
    }
    sync()
  }, [loading, tasks])

  const completed = tasks.filter((task) => task.done).length

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Onboarding</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Get ready for your first win.</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Complete these steps to unlock the full athlete experience.</p>
          </div>
          <Link
            href="/athlete/dashboard"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
          >
            Back to dashboard
          </Link>
        </header>

        <section className="mt-8 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <p className="font-semibold text-[#191919]">Progress</p>
            <p className="text-[#4a4a4a]">
              {completed}/{tasks.length} complete
            </p>
          </div>
          <div className="grid gap-4">
            {tasks.map((task) => (
              <div key={task.id} className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[#191919]">{task.title}</p>
                    <p className="mt-1 text-sm text-[#4a4a4a]">{task.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${task.done ? 'text-[#2f7a4f]' : 'text-[#4a4a4a]'}`}>
                      {task.done ? 'Done' : 'Pending'}
                    </span>
                    {task.action ? (
                      <Link
                        href={task.action.href}
                        className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        {task.action.label}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
