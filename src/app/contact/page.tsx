'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'

const topics = [
  { value: 'support', label: 'Support' },
  { value: 'sales', label: 'Sales or demo' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'feedback', label: 'Feedback' },
]

export default function ContactPage() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitted(false)
    setSubmitError('')
    const form = event.currentTarget
    const formData = new FormData(form)
    try {
      const response = await fetch('/api/support/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(formData.get('name') || '').trim(),
          email: String(formData.get('email') || '').trim(),
          request_type: String(formData.get('topic') || 'support'),
          message: String(formData.get('message') || '').trim(),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Unable to send your message right now.')
      form.reset()
      setSubmitted(true)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to send your message right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="page-shell public-page">
    <div className="relative z-10 mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-24">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">Contact</p>
        <h1 className="display mt-3 text-4xl font-semibold text-[#191919] sm:text-5xl">Send us a message.</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#666] sm:text-lg">
          Questions, support needs, demo requests, or partnership ideas. We usually reply within one to two business days.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-10 space-y-5 rounded-[2rem] border border-[#d8d8d8] bg-white p-5 shadow-sm sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-[.18em] text-[#666]">Name
            <input required name="name" autoComplete="name" placeholder="Your name" className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]" />
          </label>
          <label className="text-xs font-bold uppercase tracking-[.18em] text-[#666]">Email
            <input required type="email" name="email" autoComplete="email" placeholder="you@example.com" className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]" />
          </label>
        </div>
        <label className="block text-xs font-bold uppercase tracking-[.18em] text-[#666]">Topic
          <select required name="topic" defaultValue="support" className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]">
            {topics.map(topic => <option value={topic.value} key={topic.value}>{topic.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-[.18em] text-[#666]">Message
          <textarea required name="message" rows={7} minLength={10} placeholder="How can we help?" className="mt-2 w-full resize-y rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]" />
        </label>
        {submitted ? <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">Thanks—your message was sent. We’ll be in touch soon.</p> : null}
        {submitError ? <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-[#b80f0a]">{submitError}</p> : null}
        <button disabled={submitting} className="w-full rounded-full bg-[#b80f0a] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#98100c] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Sending…' : 'Send message'}</button>
      </form>

      <p className="mt-6 text-center text-sm text-[#666]">Prefer email? Contact{' '}<Link href="mailto:support@coacheshive.com" className="font-semibold text-[#b80f0a] underline underline-offset-2">support@coacheshive.com</Link>.</p>
    </div>
  </main>
}
