'use client'

import { useCallback, useEffect, useState } from 'react'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { getActiveOrganizationId } from '@/lib/clientOrganization'

type EnrollmentForm = {
  id: string
  title: string
  description: string | null
  sport: string | null
  age_group: string | null
  is_active: boolean
  slug: string
  team_id: string | null
  season_id: string | null
  enrollment_fee_cents: number | null
  submission_count: number
  created_at: string
  required_documents?: DocumentRequirement[]
  required_waiver_ids?: string[]
}

type DocumentRequirement = { id: string; label: string; instructions: string; required: boolean }

type Submission = {
  id: string
  athlete_name: string
  athlete_email: string
  guardian_name: string | null
  guardian_email: string | null
  guardian_phone: string | null
  date_of_birth: string | null
  notes: string | null
  status: string
  payment_status?: string | null
  created_at: string
  documents?: Array<{ id: string; requirement_id: string; filename: string; download_url: string | null }>
}

type Team = { id: string; name: string }
type Season = { id: string; name: string }
type Waiver = { id: string; title: string; is_active: boolean }

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-[#b80f0a]',
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getPublicUrl(slug: string) {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/enroll/${slug}`
  }
  return `/enroll/${slug}`
}

export default function OrgEnrollmentPage() {
  const supabase = createClientComponentClient()
  const [forms, setForms] = useState<EnrollmentForm[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // Create form modal
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '', description: '', sport: '', age_group: '', team_id: '', season_id: '', enrollment_fee: '', required_documents: [] as DocumentRequirement[], required_waiver_ids: [] as string[],
  })
  const [editingDocumentsFor, setEditingDocumentsFor] = useState<string | null>(null)
  const [documentDraft, setDocumentDraft] = useState<DocumentRequirement[]>([])
  const [waiverDraft, setWaiverDraft] = useState<string[]>([])

  // Submissions expanded per form
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Record<string, Submission[]>>({})
  const [loadingSubmissions, setLoadingSubmissions] = useState<string | null>(null)
  const [actioningSubmission, setActioningSubmission] = useState<string | null>(null)

  // Copy state
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      const orgId = await getActiveOrganizationId(supabase)
      if (!orgId || !active) return

      const [formsRes, teamsRes, seasonsRes, waiversRes] = await Promise.all([
        fetch('/api/org/enrollment'),
        supabase.from('org_teams').select('id, name').eq('org_id', orgId).order('name'),
        supabase.from('org_seasons').select('id, name').eq('org_id', orgId).order('created_at', { ascending: false }),
        fetch('/api/org/waivers'),
      ])
      if (!active) return

      const formsData = await formsRes.json().catch(() => ({}))
      const waiversData = await waiversRes.json().catch(() => ({}))
      setForms(formsData.forms ?? [])
      setTeams((teamsRes.data || []) as Team[])
      setSeasons((seasonsRes.data || []) as Season[])
      setWaivers((waiversData.waivers || []).filter((waiver: Waiver) => waiver.is_active))
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [supabase])

  const handleCreate = useCallback(async () => {
    if (!createForm.title.trim() || creating) return
    setCreating(true)
    const res = await fetch('/api/org/enrollment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
        sport: createForm.sport.trim() || null,
        age_group: createForm.age_group.trim() || null,
        enrollment_fee_cents: createForm.enrollment_fee ? Math.round(parseFloat(createForm.enrollment_fee) * 100) : 0,
        team_id: createForm.team_id || null,
        season_id: createForm.season_id || null,
        required_documents: createForm.required_documents,
        required_waiver_ids: createForm.required_waiver_ids,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setCreating(false)
    if (!res.ok) { setToast(data?.error || 'Failed to create form'); return }
    setForms((prev) => [{ ...data.form, submission_count: 0 }, ...prev])
    setCreateForm({ title: '', description: '', sport: '', age_group: '', team_id: '', season_id: '', enrollment_fee: '', required_documents: [], required_waiver_ids: [] })
    setShowCreate(false)
    setToast('Enrollment form created')
  }, [createForm, creating])

  const addDocumentRequirement = (target: 'create' | 'edit') => {
    const item = { id: crypto.randomUUID(), label: '', instructions: '', required: true }
    if (target === 'create') setCreateForm((current) => ({ ...current, required_documents: [...current.required_documents, item] }))
    else setDocumentDraft((current) => [...current, item])
  }

  const saveDocumentRequirements = async (formId: string) => {
    const required_documents = documentDraft.filter((item) => item.label.trim())
    const response = await fetch(`/api/org/enrollment/${formId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ required_documents, required_waiver_ids: waiverDraft }),
    })
    if (!response.ok) { setToast('Failed to update document requirements'); return }
    setForms((current) => current.map((form) => form.id === formId ? { ...form, required_documents, required_waiver_ids: waiverDraft } : form))
    setEditingDocumentsFor(null)
    setToast('Document requirements updated')
  }

  const handleToggleActive = useCallback(async (form: EnrollmentForm) => {
    const res = await fetch(`/api/org/enrollment/${form.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !form.is_active }),
    })
    if (!res.ok) { setToast('Failed to update form'); return }
    setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, is_active: !form.is_active } : f))
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/org/enrollment/${id}`, { method: 'DELETE' })
    if (!res.ok) { setToast('Failed to delete form'); return }
    setForms((prev) => prev.filter((f) => f.id !== id))
    setToast('Form deleted')
  }, [])

  const loadSubmissions = useCallback(async (formId: string) => {
    if (expandedFormId === formId) { setExpandedFormId(null); return }
    setExpandedFormId(formId)
    if (submissions[formId]) return
    setLoadingSubmissions(formId)
    const res = await fetch(`/api/org/enrollment/${formId}/submissions`)
    const data = await res.json().catch(() => ({}))
    setSubmissions((prev) => ({ ...prev, [formId]: data.submissions ?? [] }))
    setLoadingSubmissions(null)
  }, [expandedFormId, submissions])

  const handleSubmissionAction = useCallback(async (formId: string, submissionId: string, action: 'approve' | 'decline') => {
    setActioningSubmission(submissionId)
    const res = await fetch(`/api/org/enrollment/${formId}/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json().catch(() => ({}))
    setActioningSubmission(null)
    if (!res.ok) { setToast(data?.error || 'Failed to update submission'); return }
    setSubmissions((prev) => ({
      ...prev,
      [formId]: (prev[formId] || []).map((s) => s.id === submissionId ? { ...s, status: action === 'approve' ? 'approved' : 'declined' } : s),
    }))
    setToast(action === 'approve' ? 'Approved — invite sent' : 'Declined')
  }, [])

  const copyLink = useCallback((slug: string) => {
    const url = getPublicUrl(slug)
    navigator.clipboard.writeText(url).then(() => {
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    })
  }, [])

  return (
    <div className="portal-inner">
      <div className="lg:hidden"><OrgSidebar /></div>
      <Toast message={toast} onClose={() => setToast('')} />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#191919]">Enrollment</h1>
            <p className="mt-1 text-sm text-[#4a4a4a]">Create public forms athletes can use to apply to your program.</p>
          </div>
          {!showCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white"
            >
              + New form
            </button>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="mb-6 rounded-2xl border border-[#dcdcdc] bg-white p-5">
            <p className="mb-4 text-sm font-semibold text-[#191919]">New enrollment form</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Title *</label>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  placeholder="e.g. Summer 2025 Tryout Applications"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Description</label>
                <textarea
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  rows={2}
                  value={createForm.description}
                  onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Sport</label>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  placeholder="Basketball"
                  value={createForm.sport}
                  onChange={(e) => setCreateForm((p) => ({ ...p, sport: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Age group</label>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  placeholder="U14, 8U, etc."
                  value={createForm.age_group}
                  onChange={(e) => setCreateForm((p) => ({ ...p, age_group: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Application fee ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  placeholder="0.00"
                  value={createForm.enrollment_fee}
                  onChange={(e) => setCreateForm((p) => ({ ...p, enrollment_fee: e.target.value }))}
                />
              </div>
              {teams.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Team (optional)</label>
                  <select
                    className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                    value={createForm.team_id}
                    onChange={(e) => setCreateForm((p) => ({ ...p, team_id: e.target.value }))}
                  >
                    <option value="">No team</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {seasons.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Season (optional)</label>
                  <select
                    className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                    value={createForm.season_id}
                    onChange={(e) => setCreateForm((p) => ({ ...p, season_id: e.target.value }))}
                  >
                    <option value="">No season</option>
                    {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2 rounded-xl border border-[#dcdcdc] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs font-semibold text-[#191919]">Required parent documents</p><p className="text-xs text-[#6b6b6b]">Examples: birth certificate, physical, insurance card, or proof of residency.</p></div>
                  <button type="button" onClick={() => addDocumentRequirement('create')} className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold">+ Add document</button>
                </div>
                <div className="mt-3 space-y-3">
                  {createForm.required_documents.map((document, index) => (
                    <div key={document.id} className="grid gap-2 rounded-xl bg-[#f7f6f4] p-3 sm:grid-cols-[1fr_1fr_auto]">
                      <input value={document.label} placeholder="Document name" className="rounded-lg border px-3 py-2 text-sm" onChange={(event) => setCreateForm((current) => ({ ...current, required_documents: current.required_documents.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }))} />
                      <input value={document.instructions} placeholder="Instructions (optional)" className="rounded-lg border px-3 py-2 text-sm" onChange={(event) => setCreateForm((current) => ({ ...current, required_documents: current.required_documents.map((item, itemIndex) => itemIndex === index ? { ...item, instructions: event.target.value } : item) }))} />
                      <button type="button" className="text-xs font-semibold text-[#b80f0a]" onClick={() => setCreateForm((current) => ({ ...current, required_documents: current.required_documents.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
              <fieldset className="sm:col-span-2 rounded-xl border border-[#dcdcdc] p-4">
                <legend className="px-1 text-xs font-semibold text-[#191919]">Required waivers</legend>
                <p className="mb-3 text-xs text-[#6b6b6b]">Parents must review and electronically sign every selected waiver before submitting.</p>
                {waivers.length ? <div className="space-y-2">{waivers.map((waiver) => <label key={waiver.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createForm.required_waiver_ids.includes(waiver.id)} onChange={(event) => setCreateForm((current) => ({ ...current, required_waiver_ids: event.target.checked ? [...current.required_waiver_ids, waiver.id] : current.required_waiver_ids.filter((id) => id !== waiver.id) }))}/><span>{waiver.title}</span></label>)}</div> : <p className="text-xs text-[#6b6b6b]">Create and activate waivers in the Waivers section before attaching them here.</p>}
              </fieldset>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!createForm.title.trim() || creating}
                onClick={handleCreate}
                className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create form'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-full border border-[#dcdcdc] px-4 py-2 text-sm font-semibold text-[#4a4a4a]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Forms list */}
        {loading ? (
          <p className="text-sm text-[#9b9b9b]">Loading...</p>
        ) : forms.length === 0 ? (
          <div className="rounded-2xl border border-[#dcdcdc] bg-white p-10 text-center">
            <p className="text-sm text-[#9b9b9b]">No enrollment forms yet. Create one to share a public signup link with athletes.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {forms.map((form) => {
              const isExpanded = expandedFormId === form.id
              const formSubs = submissions[form.id] || []
              return (
                <div key={form.id} className="rounded-2xl border border-[#dcdcdc] bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#191919]">{form.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${form.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-[#9b9b9b]'}`}>
                          {form.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {form.submission_count > 0 && (
                          <span className="text-xs text-[#4a4a4a]">{form.submission_count} application{form.submission_count !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      {form.description && <p className="mt-0.5 text-xs text-[#9b9b9b]">{form.description}</p>}
                      <p className="mt-1 text-xs text-[#4a4a4a]">
                        Application fee: {form.enrollment_fee_cents ? `$${(form.enrollment_fee_cents / 100).toFixed(2).replace(/\.00$/, '')}` : 'Free'}
                      </p>
                      <p className="mt-1 text-xs text-[#4a4a4a]">Required documents: {(form.required_documents || []).filter((item) => item.required !== false).length} · Required waivers: {(form.required_waiver_ids || []).length}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="truncate text-xs text-[#9b9b9b]">/enroll/{form.slug}</span>
                        <button
                          type="button"
                          onClick={() => copyLink(form.slug)}
                          className="shrink-0 rounded-full border border-[#dcdcdc] px-2 py-0.5 text-xs font-semibold text-[#4a4a4a]"
                        >
                          {copiedSlug === form.slug ? 'Copied!' : 'Copy link'}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => loadSubmissions(form.id)}
                        className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#4a4a4a]"
                      >
                        {isExpanded ? 'Hide' : 'View applications'}
                      </button>
                      <button type="button" onClick={() => { setEditingDocumentsFor(form.id); setDocumentDraft(form.required_documents || []); setWaiverDraft(form.required_waiver_ids || []) }} className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#4a4a4a]">Requirements</button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(form)}
                        className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#4a4a4a]"
                      >
                        {form.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(form.id)}
                        className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#b80f0a]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {editingDocumentsFor === form.id && (
                    <div className="border-t border-[#f5f5f5] bg-[#fafafa] p-4">
                      <div className="flex items-center justify-between"><p className="text-sm font-semibold">Parent document requirements</p><button type="button" onClick={() => addDocumentRequirement('edit')} className="rounded-full border px-3 py-1 text-xs font-semibold">+ Add</button></div>
                      <div className="mt-3 space-y-2">
                        {documentDraft.map((document, index) => <div key={document.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className="rounded-lg border px-3 py-2 text-sm" placeholder="Document name" value={document.label} onChange={(event) => setDocumentDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /><input className="rounded-lg border px-3 py-2 text-sm" placeholder="Instructions" value={document.instructions} onChange={(event) => setDocumentDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, instructions: event.target.value } : item))} /><button type="button" className="text-xs font-semibold text-[#b80f0a]" onClick={() => setDocumentDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}
                      </div>
                      <div className="mt-4 border-t pt-4"><p className="text-sm font-semibold">Required waivers</p><div className="mt-2 space-y-2">{waivers.length ? waivers.map((waiver) => <label key={waiver.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={waiverDraft.includes(waiver.id)} onChange={(event) => setWaiverDraft((current) => event.target.checked ? [...current, waiver.id] : current.filter((id) => id !== waiver.id))}/><span>{waiver.title}</span></label>) : <p className="text-xs text-[#6b6b6b]">No active waivers are available.</p>}</div></div>
                      <div className="mt-3 flex gap-2"><button type="button" onClick={() => saveDocumentRequirements(form.id)} className="rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-white">Save requirements</button><button type="button" onClick={() => setEditingDocumentsFor(null)} className="rounded-full border px-4 py-2 text-xs font-semibold">Cancel</button></div>
                    </div>
                  )}

                  {/* Submissions */}
                  {isExpanded && (
                    <div className="border-t border-[#f5f5f5] p-4">
                      {loadingSubmissions === form.id ? (
                        <p className="text-sm text-[#9b9b9b]">Loading applications...</p>
                      ) : formSubs.length === 0 ? (
                        <p className="text-sm text-[#9b9b9b]">No applications yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {formSubs.map((sub) => (
                            <div key={sub.id} className="rounded-xl border border-[#dcdcdc] p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-[#191919]">{sub.athlete_name}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_COLORS[sub.status] || 'bg-gray-100 text-[#4a4a4a]'}`}>
                                      {sub.status}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#9b9b9b]">{sub.athlete_email} · {formatDate(sub.created_at)}</p>
                                  {sub.guardian_name && (
                                    <p className="text-xs text-[#4a4a4a]">Guardian: {sub.guardian_name}{sub.guardian_email ? ` · ${sub.guardian_email}` : ''}</p>
                                  )}
                                  <p className="text-xs text-[#4a4a4a]">Payment: {sub.payment_status || 'unpaid'}</p>
                                  {sub.notes && <p className="mt-1 text-xs text-[#9b9b9b]">{sub.notes}</p>}
                                  {sub.documents?.length ? <div className="mt-2 flex flex-wrap gap-2">{sub.documents.map((document) => document.download_url ? <a key={document.id} href={document.download_url} target="_blank" rel="noreferrer" className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#191919]">Download {document.filename}</a> : null)}</div> : null}
                                </div>
                                {sub.status === 'pending' && (
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      disabled={actioningSubmission === sub.id}
                                      onClick={() => handleSubmissionAction(form.id, sub.id, 'approve')}
                                      className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                    >
                                      {actioningSubmission === sub.id ? '...' : 'Approve'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actioningSubmission === sub.id}
                                      onClick={() => handleSubmissionAction(form.id, sub.id, 'decline')}
                                      className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#b80f0a] disabled:opacity-50"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
