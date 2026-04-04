'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { FormEvent } from 'react'

const contactRoutes = [
  {
    title: 'Support',
    detail: 'Help with bookings, billing, or technical issues.',
    action: 'support@coacheshive.com',
    href: 'mailto:support@coacheshive.com',
  },
  {
    title: 'Sales',
    detail: 'Org demos, pricing questions, and rollout planning.',
    action: 'support@coacheshive.com',
    href: 'mailto:support@coacheshive.com',
  },
  {
    title: 'Partnerships',
    detail: 'Integration ideas and strategic partnerships.',
    action: 'support@coacheshive.com',
    href: 'mailto:support@coacheshive.com',
  },
]

const interestAreas = [
  'Compliance-ready billing',
  'Role-based access',
  'Exportable reports',
  'Automated fee reminders',
  'Marketplace + payouts',
  'Scheduling + messaging',
]

const requestTypeOptions = [
  { value: 'support', label: 'Support' },
  { value: 'sales', label: 'Sales' },
  { value: 'partnership', label: 'Partnership' },
]

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError('')
    setSubmitted(false)
    setSubmitting(true)

    const form = event.currentTarget
    const formData = new FormData(form)

    const fullName = String(formData.get('full_name') || '').trim()
    const email = String(formData.get('email') || '').trim()
    const orgName = String(formData.get('org_name') || '').trim()
    const role = String(formData.get('role') || '').trim()
    const requestType = String(formData.get('request_type') || 'sales').trim()
    const teams = String(formData.get('teams') || '').trim()
    const athletes = String(formData.get('athletes') || '').trim()
    const notes = String(formData.get('notes') || '').trim()
    const interests = formData
      .getAll('interest')
      .map((value) => (typeof value === 'string' ? value : ''))
      .filter(Boolean)

    const details = [
      `Organization: ${orgName}`,
      `Role: ${role}`,
      `Teams: ${teams}`,
      `Athletes: ${athletes}`,
      interests.length > 0 ? `Interest areas: ${interests.join(', ')}` : '',
      notes ? `Notes: ${notes}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const message = `Org demo request\n${details}`

    try {
      const response = await fetch('/api/support/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName,
          email,
          message,
          request_type: requestType,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setSubmitError(payload?.error || 'Unable to submit request right now.')
        return
      }

      form.reset()
      setSubmitted(true)
    } catch {
      setSubmitError('Unable to submit request right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <header className="text-center">
          <p className="public-kicker">Contact</p>
          <h1 className="public-title mt-2 text-4xl md:text-5xl">
            Contact Coaches Hive
          </h1>
          <p className="public-copy mx-auto mt-3 max-w-3xl text-sm md:text-base">
            Reach out for support, org demos, or partnership requests and we will respond quickly.
          </p>
        </header>

        <section className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Get in touch</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Fast, human support.</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Choose the best path below or send a demo request form for org pricing and rollout help.
            </p>
            <div className="mt-5 space-y-3">
              {contactRoutes.map((route) => (
                <Link
                  key={route.title}
                  href={route.href}
                  className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#4a4a4a] hover:bg-white"
                >
                  <div>
                    <p className="font-semibold text-[#191919]">{route.title}</p>
                    <p className="text-xs text-[#4a4a4a]">{route.detail}</p>
                  </div>
                  <span className="text-xs font-semibold text-[#191919]">{route.action}</span>
                </Link>
              ))}
            </div>
            <div className="mt-6 grid gap-3 text-sm text-[#4a4a4a]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Office hours</p>
                <p className="mt-1 text-sm text-[#191919]">Mon - Fri, 9 AM - 5 PM ET</p>
              </div>
            </div>
          </div>

          <div id="org-demo" className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Org demo request</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Tell us about your program.</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Share the basics and we will map the right rollout plan for your teams.
            </p>
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-[#4a4a4a]">
                  Request type
                  <select
                    name="request_type"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    defaultValue="sales"
                    required
                  >
                    {requestTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-[#4a4a4a]">
                  Full name
                  <input
                    type="text"
                    name="full_name"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="Alex Morgan"
                    required
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-[#4a4a4a]">
                  Work email
                  <input
                    type="email"
                    name="email"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="alex@club.com"
                    required
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-[#4a4a4a]">
                  Organization
                  <input
                    type="text"
                    name="org_name"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="Northside Athletics"
                    required
                  />
                </label>
                <label className="text-xs font-semibold text-[#4a4a4a]">
                  Role
                  <select
                    name="role"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select role
                    </option>
                    <option value="org_admin">Org admin</option>
                    <option value="athletic_director">Athletic director</option>
                    <option value="team_manager">Team manager</option>
                    <option value="coach">Coach</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-[#4a4a4a]">
                  Number of teams
                  <select
                    name="teams"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select range
                    </option>
                    <option value="1-3">1-3</option>
                    <option value="4-10">4-10</option>
                    <option value="11-25">11-25</option>
                    <option value="26+">26+</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-[#4a4a4a]">
                  Number of athletes
                  <select
                    name="athletes"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select range
                    </option>
                    <option value="1-50">1-50</option>
                    <option value="51-200">51-200</option>
                    <option value="201-500">201-500</option>
                    <option value="500+">500+</option>
                  </select>
                </label>
              </div>
              <label className="text-xs font-semibold text-[#4a4a4a]">
                What are you most interested in?
                <div className="mt-2 flex flex-wrap gap-2">
                  {interestAreas.map((area) => (
                    <label
                      key={area}
                      className="flex items-center gap-2 rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#4a4a4a]"
                    >
                      <input type="checkbox" name="interest" value={area} className="accent-[#b80f0a]" />
                      <span>{area}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label className="text-xs font-semibold text-[#4a4a4a]">
                Notes
                <textarea
                  name="notes"
                  className="mt-2 min-h-[120px] w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  placeholder="Tell us about your org timeline, billing setup, or questions."
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#4a4a4a]">We will follow up soon.</p>
                <button type="submit" className="accent-button px-6 py-3" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send request'}
                </button>
              </div>
              {submitError && (
                <div className="rounded-2xl border border-[#b80f0a] bg-white px-4 py-3 text-sm text-[#b80f0a]">
                  {submitError}
                </div>
              )}
              {submitted && (
                <div className="rounded-2xl border border-[#191919] bg-white px-4 py-3 text-sm text-[#4a4a4a]">
                  Thanks! Your request was sent to support. We will be in touch shortly.
                </div>
              )}
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
