'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'

const sports = [
  'Baseball', 'Basketball', 'Cheer', 'Dance', 'Football', 'Golf', 'Gymnastics',
  'Hockey', 'Lacrosse', 'Multi-sport', 'Soccer', 'Softball', 'Swimming',
  'Tennis', 'Track & Field', 'Volleyball', 'Wrestling', 'Other',
]

const rosterSizes = ['1-24', '25-99', '100-249', '250-499', '500+']

export default function DemoPage() {
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
          phone: String(formData.get('phone') || '').trim(),
          org_name: String(formData.get('org_name') || '').trim(),
          sport: String(formData.get('sport') || '').trim(),
          roster_size: String(formData.get('roster_size') || '').trim(),
          state: String(formData.get('state') || '').trim(),
          message: String(formData.get('message') || '').trim(),
          request_type: 'sales',
          source: 'demo_page',
          website: String(formData.get('website') || ''),
        }),
      })
      const responsePayload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(responsePayload.error || 'Unable to send your request right now.')
      form.reset()
      setSubmitted(true)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to send your request right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="page-shell public-page">
    <div className="relative z-10 mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-24">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">Get a demo</p>
        <h1 className="display mt-3 text-4xl font-semibold text-[#191919] sm:text-5xl">See Coaches Hive in action.</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#666] sm:text-lg">
          Tell us a bit about your organization and we&apos;ll reach out to schedule a walkthrough.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-10 space-y-5 rounded-[2rem] border border-[#d8d8d8] bg-white p-5 shadow-sm sm:p-8">
        {/* Honeypot — hidden from real users, bots fill it in */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute opacity-0 pointer-events-none h-0 w-0" />

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-[.18em] text-[#666]">Name
            <input required name="name" autoComplete="name" placeholder="Your name" className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]" />
          </label>
          <label className="text-xs font-bold uppercase tracking-[.18em] text-[#666]">Email
            <input required type="email" name="email" autoComplete="email" placeholder="you@example.com" className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]" />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-[.18em] text-[#666]">Phone
            <input type="tel" name="phone" autoComplete="tel" placeholder="(555) 555-5555" className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]" />
          </label>
          <label className="text-xs font-bold uppercase tracking-[.18em] text-[#666]">Organization or team name
            <input required name="org_name" placeholder="Your organization" className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]" />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className="text-xs font-bold uppercase tracking-[.18em] text-[#666]">Sport
            <select name="sport" defaultValue="" className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]">
              <option value="" disabled>Select a sport</option>
              {sports.map((sport) => <option value={sport} key={sport}>{sport}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-[.18em] text-[#666]">Number of athletes
            <select name="roster_size" defaultValue="" className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]">
              <option value="" disabled>Select a range</option>
              {rosterSizes.map((size) => <option value={size} key={size}>{size}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-[.18em] text-[#666]">State
            <input name="state" placeholder="e.g. SC" maxLength={2} className="mt-2 w-full rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case uppercase tracking-normal text-[#191919] outline-none focus:border-[#191919]" />
          </label>
        </div>

        <label className="block text-xs font-bold uppercase tracking-[.18em] text-[#666]">Anything else we should know?
          <textarea name="message" rows={4} placeholder="Optional" className="mt-2 w-full resize-y rounded-2xl border border-[#d8d8d8] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#191919] outline-none focus:border-[#191919]" />
        </label>

        {submitted ? <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">Thanks—we&apos;ll be in touch to schedule your demo.</p> : null}
        {submitError ? <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-[#b80f0a]">{submitError}</p> : null}
        <button disabled={submitting} className="w-full rounded-full bg-[#b80f0a] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#98100c] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Sending…' : 'Request demo'}</button>
      </form>

      <p className="mt-6 text-center text-sm text-[#666]">Have a question instead? <Link href="/contact" className="font-semibold text-[#b80f0a] underline underline-offset-2">Contact us</Link>.</p>
    </div>
  </main>
}
