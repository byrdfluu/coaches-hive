'use client'

import { useState, type ChangeEvent } from 'react'
import Toast from '@/components/Toast'

export default function AboutPage() {
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [formValues, setFormValues] = useState({
    name: '',
    email: '',
    message: '',
  })

  const handleChange = (field: 'name' | 'email' | 'message') => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormValues((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleSubmit = () => {
    setToast('')
    setLoading(true)
    fetch('/api/support/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formValues),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload?.error || 'Unable to send message.')
        }
      })
      .then(() => {
        setToast('Thanks! We received your message.')
        setFormValues({ name: '', email: '', message: '' })
      })
      .catch((error: Error) => {
        setToast(error.message || 'Unable to send message.')
      })
      .finally(() => setLoading(false))
  }

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <header className="max-w-3xl">
          <p className="public-kicker">About</p>
          <h1 className="public-title mt-2 text-4xl md:text-5xl">
            Building the simplest way for coaches and athletes to work together.
          </h1>
        </header>


        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Our mission</p>
            <h3 className="mt-2 text-xl font-semibold text-[#191919]">Help coaches run better programs and athletes progress faster.</h3>
            <p className="mt-3 text-sm text-[#4a4a4a]">
              Coaches Hive gives coaches, athletes, and organizations one place to manage training, communication, scheduling, payments, and program operations. Our goal is simple: reduce admin overhead, improve trust, and make it easier for people to do great work in sports.
            </p>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Our values</p>
            <h3 className="mt-2 text-xl font-semibold text-[#191919]">How we build</h3>
            <ul className="mt-3 space-y-2 text-sm text-[#4a4a4a]">
              <li><span className="font-semibold text-[#191919]">Trust first:</span> verified identities, clear permissions, and safer communication.</li>
              <li><span className="font-semibold text-[#191919]">Outcome over activity:</span> tools should save time and improve results, not add busywork.</li>
              <li><span className="font-semibold text-[#191919]">Access for every level:</span> support private coaching, teams, and full organizations.</li>
              <li><span className="font-semibold text-[#191919]">Accountability by default:</span> transparent records for decisions, approvals, and operations.</li>
            </ul>
          </div>
        </section>


        <section className="mt-12 glass-card border border-[#191919] bg-white p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Contact Us</p>
          <h3 className="mt-2 text-xl font-semibold text-[#191919]">Questions, comments, or concerns?</h3>
          <p className="mt-2 text-sm text-[#4a4a4a]">Send us a note and we’ll get back to you.</p>
          <form className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#191919]" htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                placeholder="Enter your name"
                value={formValues.name}
                onChange={handleChange('name')}
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#191919]" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formValues.email}
                onChange={handleChange('email')}
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#191919]" htmlFor="message">Message</label>
              <textarea
                id="message"
                placeholder="How can we help?"
                rows={4}
                value={formValues.message}
                onChange={handleChange('message')}
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
              />
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-2xl bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#b80f0a] disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Submit'}
            </button>
          </form>
        </section>

      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
