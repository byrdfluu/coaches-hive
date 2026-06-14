'use client'

import { useCallback, useEffect, useState } from 'react'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

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
  submission_count: number
  created_at: string
}

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
  created_at: string
}

type Team = { id: string; name: string }
type Season = { id: string; name: string }

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
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // Create form modal
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '', description: '', sport: '', age_group: '', team_id: '', season_id: '',
  })

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
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle()
      const orgId = (membership as { org_id?: string } | null)?.org_id
      if (!orgId || !active) return

      const [formsRes, teamsRes, seasonsRes] = await Promise.all([
        fetch('/api/org/enrollment'),
        supabase.from('org_teams').select('id, name').eq('org_id', orgId).order('name'),
        supabase.from('org_seasons').select('id, name').eq('org_id', orgId).order('created_at', { ascending: false }),
      ])
      if (!active) return

      const formsData = await formsRes.json().catch(() => ({}))
      setForms(formsData.forms ?? [])
      setTeams((teamsRes.data || []) as Team[])
      setSeasons((seasonsRes.data || []) as Season[])
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
        team_id: createForm.team_id || null,
        season_id: createForm.season_id || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setCreating(false)
    if (!res.ok) { setToast(data?.error || 'Failed to create form'); return }
    setForms((prev) => [{ ...data.form, submission_count: 0 }, ...prev])
    setCreateForm({ title: '', description: '', sport: '', age_group: '', team_id: '', season_id: '' })
    setShowCreate(false)
    setToast('Enrollment form created')
  }, [createForm, creating])

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
                                  {sub.notes && <p className="mt-1 text-xs text-[#9b9b9b]">{sub.notes}</p>}
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
