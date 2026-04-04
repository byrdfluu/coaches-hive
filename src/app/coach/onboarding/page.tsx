'use client'

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

export default function CoachOnboardingPage() {
  const supabase = createClientComponentClient()
  const [stripeConnected, setStripeConnected] = useState(false)
  const [hasAvatar, setHasAvatar] = useState(false)
  const [hasBio, setHasBio] = useState(false)
  const [hasRates, setHasRates] = useState(false)
  const [availabilityCount, setAvailabilityCount] = useState(0)
  const [productCount, setProductCount] = useState(0)
  const [sessionCount, setSessionCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return

      const [{ data: profile }, { data: coachSettings }, availabilityRows, productRows, sessionRows] = await Promise.all([
        supabase.from('profiles').select('stripe_account_id, avatar_url').eq('id', userId).maybeSingle(),
        supabase.from('coach_profile_settings').select('bio, rates').eq('coach_id', userId).maybeSingle(),
        supabase.from('availability_blocks').select('id').eq('coach_id', userId),
        supabase.from('products').select('id').eq('coach_id', userId),
        supabase.from('sessions').select('id, start_time').eq('coach_id', userId),
      ])

      if (!active) return
      setStripeConnected(Boolean(profile?.stripe_account_id))
      setHasAvatar(Boolean(profile?.avatar_url))
      setHasBio(Boolean(coachSettings?.bio && String(coachSettings.bio).trim().length > 0))
      const rates = coachSettings?.rates as Record<string, unknown> | null
      setHasRates(Boolean(rates && Object.keys(rates).length > 0))
      setAvailabilityCount((availabilityRows.data || []).length)
      setProductCount((productRows.data || []).length)
      setSessionCount((sessionRows.data || []).length)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [supabase])

  const tasks: Task[] = useMemo(() => [
    {
      id: 'avatar',
      title: 'Add a profile photo',
      description: 'A photo builds trust with athletes before they book.',
      done: hasAvatar,
      action: { label: 'Edit profile', href: '/coach/settings' },
    },
    {
      id: 'bio',
      title: 'Write your bio',
      description: 'Tell athletes about your coaching background and style.',
      done: hasBio,
      action: { label: 'Edit profile', href: '/coach/settings' },
    },
    {
      id: 'rates',
      title: 'Set session rates',
      description: 'Define your pricing so athletes know what to expect.',
      done: hasRates,
      action: { label: 'Set rates', href: '/coach/settings' },
    },
    {
      id: 'stripe',
      title: 'Connect payouts',
      description: 'Link Stripe so payouts can be scheduled automatically.',
      done: stripeConnected,
      action: { label: 'Connect Stripe', href: '/coach/settings' },
    },
    {
      id: 'availability',
      title: 'Publish availability',
      description: 'Open time blocks so athletes can book sessions.',
      done: availabilityCount > 0,
      action: { label: 'Set availability', href: '/coach/calendar' },
    },
    {
      id: 'listing',
      title: 'Create your first listing',
      description: 'Add a session or program so athletes can purchase.',
      done: productCount > 0,
      action: { label: 'Create listing', href: '/coach/marketplace/create' },
    },
    {
      id: 'booking',
      title: 'Complete first booking',
      description: 'Lock in your first session with an athlete.',
      done: sessionCount > 0,
      action: { label: 'View bookings', href: '/coach/bookings' },
    },
  ], [availabilityCount, hasAvatar, hasBio, hasRates, productCount, sessionCount, stripeConnected])

  useEffect(() => {
    if (loading) return
    const sync = async () => {
      const doneIds = tasks.filter((task) => task.done).map((task) => task.id)
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'coach',
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
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Onboarding</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Get your coach portal ready.</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Complete each step to activate bookings and payouts.</p>
          </div>
          <Link
            href="/coach/dashboard"
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
