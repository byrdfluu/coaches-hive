'use client'

import { useEffect, useRef, useState } from 'react'

type PlanDetail = {
  id: string
  title: string
  description?: string | null
  session_date?: string | null
  duration_minutes?: number | null
  visibility?: string | null
  shared_with_team?: boolean | null
}

type AttachmentItem = {
  id: string
  file_url: string
  file_name?: string | null
  file_type?: string | null
  file_size?: number | null
  created_at: string
}

export default function PracticePlanDetail({ planId, canUpload }: { planId: string; canUpload: boolean }) {
  const [plan, setPlan] = useState<PlanDetail | null>(null)
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [shareWithTeam, setShareWithTeam] = useState<boolean>(false)
  const [shareNotice, setShareNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [shareSaving, setShareSaving] = useState(false)

  useEffect(() => {
    let active = true
    const loadPlan = async () => {
      setLoading(true)
      const response = await fetch(`/api/practice-plans/${planId}`)
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load plan.')
          setPlan(null)
          setAttachments([])
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      const loadedPlan = payload.plan || null
      setPlan(loadedPlan)
      setShareWithTeam(!!loadedPlan?.shared_with_team)
      setAttachments(payload.attachments || [])
      setLoading(false)
    }
    loadPlan()
    return () => {
      active = false
    }
  }, [planId])

  const handleAttachClick = () => fileInputRef.current?.click()

  const handleShareWithTeamToggle = async (value: boolean) => {
    setShareWithTeam(value)
    setShareSaving(true)
    setShareNotice(null)
    const response = await fetch(`/api/practice-plans/${planId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ share_with_team: value }),
    })
    setShareSaving(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setShareWithTeam(!value)
      setShareNotice({ text: payload?.error || 'Unable to update sharing.', ok: false })
    } else {
      setShareNotice({ text: value ? 'Shared with team coaches.' : 'Sharing turned off.', ok: true })
      setPlan((prev) => prev ? { ...prev, shared_with_team: value } : prev)
    }
  }

  const handleAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const uploadResponse = await fetch('/api/storage/attachment', {
      method: 'POST',
      body: formData,
    })
    if (!uploadResponse.ok) {
      setNotice('Upload failed.')
      setUploading(false)
      return
    }
    const uploadPayload = await uploadResponse.json()
    const attachResponse = await fetch('/api/practice-plans/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        attachment: uploadPayload,
      }),
    })
    if (!attachResponse.ok) {
      setNotice('Unable to attach file.')
    } else {
      const attachPayload = await attachResponse.json()
      setAttachments((prev) => [...prev, attachPayload.attachment])
    }
    setUploading(false)
    event.target.value = ''
  }

  if (loading) {
    return (
      <section className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">
        Loading practice plan...
      </section>
    )
  }

  if (!plan) {
    return (
      <section className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">
        {notice || 'Practice plan not found.'}
      </section>
    )
  }

  return (
    <section className="glass-card border border-[#191919] bg-white p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-3xl font-semibold text-[#191919]">{plan.title}</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            {plan.session_date ? new Date(plan.session_date).toLocaleDateString() : 'No date'} ·{' '}
            {plan.duration_minutes ? `${plan.duration_minutes} min` : 'Open'} ·{' '}
            {plan.visibility || 'private'}
          </p>
        </div>
        {canUpload && (
          <div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttachment} />
            <button
              type="button"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
              onClick={handleAttachClick}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Add attachment'}
            </button>
          </div>
        )}
      </div>
      {plan.description ? (
        <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 text-sm text-[#4a4a4a]">
          {plan.description}
        </div>
      ) : null}
      <div>
        <h2 className="text-lg font-semibold text-[#191919]">Attachments</h2>
        <div className="mt-3 space-y-2 text-sm">
          {attachments.length === 0 ? (
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-3 text-xs text-[#4a4a4a]">
              No attachments yet.
            </div>
          ) : (
            attachments.map((file) => (
              <a
                key={file.id}
                href={file.file_url}
                className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3"
                target="_blank"
                rel="noreferrer"
              >
                <span className="font-semibold text-[#191919]">{file.file_name || 'Attachment'}</span>
                <span className="text-xs text-[#4a4a4a]">Open</span>
              </a>
            ))
          )}
        </div>
      </div>
      {notice ? <p className="text-xs text-[#4a4a4a]">{notice}</p> : null}

      {/* Share section */}
      <div className="border-t border-[#dcdcdc] pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#191919]">Share with team</p>
            <p className="mt-0.5 text-xs text-[#4a4a4a]">Other coaches on this team can view this plan.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={shareWithTeam}
                disabled={shareSaving}
                onChange={(e) => handleShareWithTeamToggle(e.target.checked)}
              />
              <div className="h-6 w-11 rounded-full bg-[#dcdcdc] peer-checked:bg-[#b80f0a] transition-colors" />
              <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </div>
          </label>
        </div>
        {plan.shared_with_team && (
          <span className="mt-2 inline-block rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
            Shared with team coaches
          </span>
        )}
        {shareNotice && (
          <p className={`mt-2 text-xs ${shareNotice.ok ? 'text-[#191919]' : 'text-[#b80f0a]'}`}>
            {shareNotice.text}
          </p>
        )}
      </div>
    </section>
  )
}
