'use client'

import { useState } from 'react'

const reasons = [
  ['harassment', 'Harassment or bullying'],
  ['inappropriate', 'Inappropriate content'],
  ['spam', 'Spam'],
  ['safety', 'Safety concern'],
  ['other', 'Other'],
] as const

export default function MessageReportButton({ threadId }: { threadId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<(typeof reasons)[number][0]>('harassment')
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const submit = async () => {
    if (!threadId || saving) return
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch('/api/messages/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, reason, details }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice(typeof payload?.error === 'string' ? payload.error : 'Unable to submit report.')
        return
      }
      setNotice('Report submitted for review.')
      setDetails('')
    } catch {
      setNotice('Unable to submit report.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={!threadId}
        onClick={() => { setNotice(''); setOpen(true) }}
        className="rounded-full border border-[#dcdcdc] px-2.5 py-1 text-xs font-semibold text-[#4a4a4a] hover:border-[#b80f0a] hover:text-[#b80f0a] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Report
      </button>
      {open ? (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#191919]/45 p-4" role="dialog" aria-modal="true" aria-label="Report conversation">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Safety</p>
                <h2 className="mt-1 text-xl font-semibold text-[#191919]">Report conversation</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold">Close</button>
            </div>
            <label className="mt-5 block text-sm font-semibold text-[#191919]">
              Reason
              <select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 font-normal">
                {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold text-[#191919]">
              Details (optional)
              <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={10_000} rows={5} className="mt-2 w-full resize-none rounded-2xl border border-[#dcdcdc] px-4 py-3 font-normal" placeholder="Tell the safety team what happened." />
            </label>
            {notice ? <p className={`mt-3 text-sm ${notice.startsWith('Report submitted') ? 'text-emerald-700' : 'text-[#b80f0a]'}`}>{notice}</p> : null}
            <button type="button" onClick={submit} disabled={saving || notice.startsWith('Report submitted')} className="mt-5 w-full rounded-full bg-[#b80f0a] px-5 py-3 font-semibold text-white disabled:opacity-50">
              {saving ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
