'use client'

import { useEffect, useState } from 'react'

type Props = { token: string; sessionId: string; type: string; recordId?: string; canceled: boolean }

export default function MobilePaymentCompletion({ token, sessionId, type, recordId = '', canceled }: Props) {
  const [state, setState] = useState<'canceled' | 'checking' | 'complete' | 'delayed' | 'error'>(canceled ? 'canceled' : 'checking')

  useEffect(() => {
    if (!canceled && ['coach_fee', 'program', 'fee'].includes(type) && recordId && sessionId) {
      setState('complete')
      window.location.assign(`coacheshive://payment-complete?type=${encodeURIComponent(type)}&id=${encodeURIComponent(recordId)}`)
      return
    }
    if (canceled && type === 'fee' && recordId && !token) {
      window.location.assign(`coacheshive://payment-complete?type=fee&id=${encodeURIComponent(recordId)}`)
      return
    }
    if (canceled && type === 'coach_fee' && recordId && token) {
      void fetch('/api/mobile/checkout/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, record_id: recordId }),
      }).finally(() => {
        window.location.assign(`coacheshive://payment-complete?type=coach_fee&id=${encodeURIComponent(recordId)}`)
      })
      return
    }
    if (canceled || !token || !sessionId || !['fee', 'marketplace', 'onboarding'].includes(type)) {
      if (!canceled) setState('error')
      return
    }
    let active = true
    let attempts = 0
    const poll = async () => {
      attempts += 1
      const response = await fetch(`/api/mobile/payment-status?token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!active) return
      if (response.ok && payload?.completed) {
        setState('complete')
        if (type === 'onboarding') {
          window.location.assign('coacheshive://billing-updated')
          return
        }
        const resource = payload.resource_id ? `&id=${encodeURIComponent(payload.resource_id)}` : ''
        window.location.assign(`coacheshive://payment-complete?type=${encodeURIComponent(type)}${resource}`)
        return
      }
      if (attempts >= 20) {
        setState(response.ok ? 'delayed' : 'error')
        return
      }
      window.setTimeout(poll, 1500)
    }
    poll()
    return () => { active = false }
  }, [canceled, recordId, sessionId, token, type])

  const copy = {
    canceled: ['Checkout canceled', 'No payment was recorded. You can close this window and return to Coaches Hive.'],
    checking: ['Confirming payment', 'Stripe has returned. Waiting for secure server confirmation…'],
    complete: ['Payment confirmed', 'Returning to the Coaches Hive app…'],
    delayed: ['Confirmation is taking longer', 'Your payment may still complete. Return to the app and refresh again shortly.'],
    error: ['Unable to verify checkout', 'Close this window and check payment status in Coaches Hive before trying again.'],
  }[state]

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-5 text-[#191919]">
      <section className="w-full max-w-lg rounded-3xl border border-[#dedede] bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Coaches Hive</p>
        <h1 className="mt-4 text-3xl font-semibold">{copy[0]}</h1>
        <p className="mt-4 text-sm leading-6 text-[#555]">{copy[1]}</p>
      </section>
    </main>
  )
}
