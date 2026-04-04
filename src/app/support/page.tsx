'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import Toast from '@/components/Toast'

export default function SupportPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('medium')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUserEmail(data.user?.email ?? null)
    }
    loadUser()
  }, [supabase])

  useEffect(() => {
    if (!searchParams) return
    const nextSubject = searchParams.get('subject') || ''
    const nextMessage = searchParams.get('message') || ''
    const nextPriority = searchParams.get('priority') || ''
    if (nextSubject && !subject) setSubject(nextSubject)
    if (nextMessage && !message) setMessage(nextMessage)
    if (nextPriority && priority === 'medium') setPriority(nextPriority)
  }, [message, priority, searchParams, subject])

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      setToast('Add a subject and message.')
      return
    }
    setLoading(true)
    const response = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, message, priority }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setToast(payload?.error || 'Unable to send support request.')
      setLoading(false)
      return
    }
    setSubject('')
    setMessage('')
    setPriority('medium')
    setLoading(false)
    setToast('Support request sent.')
  }

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <header className="max-w-3xl">
          <p className="public-kicker">Support</p>
          <h1 className="public-title mt-2 text-4xl md:text-5xl">How can we help?</h1>
          <p className="public-copy mt-2 text-sm md:text-base">
            Send a request and we will respond as soon as possible. {userEmail ? `Signed in as ${userEmail}.` : ''}
          </p>
        </header>

        <section className="mt-8 glass-card border border-[#191919] bg-white p-6">
          <div className="space-y-4 text-sm">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-[#4a4a4a]">Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3"
                placeholder="Brief summary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-[#4a4a4a]">Priority</span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-[#4a4a4a]">Message</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3"
                placeholder="Include any details or links that help us solve this fast."
              />
            </label>
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send support request'}
            </button>
          </div>
        </section>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
