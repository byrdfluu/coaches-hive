'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { ORG_FEATURES, formatTierName, isOrgPlanActive, normalizeOrgTier, normalizeOrgStatus } from '@/lib/planRules'
import { getOrgTypeConfig, normalizeOrgType } from '@/lib/orgTypeConfig'

type WaiverRow = {
  id: string
  title: string
  body: string
  required_roles: string[]
  is_active: boolean
  signature_count: number
  created_at: string
}

type OrgType = 'school' | 'club' | 'travel' | 'academy' | 'organization'

type UploadItem = {
  name: string
  url: string
  createdAt: string
}

const formatUploadDate = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString()
}

export default function OrgCompliancePage() {
  const supabase = createClientComponentClient()
  const [orgType, setOrgType] = useState<OrgType>('organization')
  const [orgTier, setOrgTier] = useState<'standard' | 'growth' | 'enterprise'>('standard')
  const [planStatus, setPlanStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled'>('trialing')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const [waivers, setWaivers] = useState<WaiverRow[]>([])
  const [waiversLoading, setWaiversLoading] = useState(false)
  const [waiverNotice, setWaiverNotice] = useState('')
  const [showCreateWaiver, setShowCreateWaiver] = useState(false)
  const [newWaiverTitle, setNewWaiverTitle] = useState('')
  const [newWaiverBody, setNewWaiverBody] = useState('')
  const [newWaiverRoles, setNewWaiverRoles] = useState<string[]>(['athlete'])
  const [waiverSaving, setWaiverSaving] = useState(false)
  const [expandedWaiverId, setExpandedWaiverId] = useState<string | null>(null)
  const [drilldownData, setDrilldownData] = useState<Record<string, { signed: Array<{user_id: string; full_name: string; email: string | null; signed_at: string}>; unsigned: Array<{user_id: string; full_name: string; email: string | null}> }>>({})
  const [drilldownLoading, setDrilldownLoading] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadOrgType = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle()
      const membershipRow = (membership || null) as { org_id?: string | null } | null
      if (!membershipRow?.org_id) return
      setOrgId(membershipRow.org_id)
      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('plan, plan_status')
        .eq('org_id', membershipRow.org_id)
        .maybeSingle()
      const settingsRow = (orgSettings || null) as { plan?: string | null; plan_status?: string | null } | null
      if (active && settingsRow?.plan) {
        setOrgTier(normalizeOrgTier(settingsRow.plan))
      }
      if (active && settingsRow?.plan_status) {
        setPlanStatus(normalizeOrgStatus(settingsRow.plan_status))
      }
      const { data: org } = await supabase
        .from('organizations')
        .select('org_type')
        .eq('id', membershipRow.org_id)
        .maybeSingle()
      const orgRow = (org || null) as { org_type?: string | null } | null
      if (!active) return
      setOrgType(normalizeOrgType(orgRow?.org_type))
    }
    loadOrgType()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (!orgId) return
    let active = true
    const loadUploads = async () => {
      const { data } = await supabase
        .from('org_compliance_uploads')
        .select('file_name, file_path, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (!active) return
      if (!data || data.length === 0) {
        setUploads([])
        return
      }
      const uploads = data as Array<{
        file_name?: string | null
        file_path: string
        created_at?: string | null
      }>
      const signed = await Promise.all(
        uploads.map(async (row) => {
          const { data: signedData } = await supabase.storage
            .from('attachments')
            .createSignedUrl(row.file_path, 60 * 60 * 24 * 7)
          return {
            name: row.file_name || 'Document',
            url: signedData?.signedUrl || '',
            createdAt: formatUploadDate(row.created_at),
          }
        })
      )
      setUploads(signed.filter((item) => item.url))
    }
    loadUploads()
    return () => {
      active = false
    }
  }, [orgId, supabase])

  const loadWaivers = async () => {
    setWaiversLoading(true)
    const res = await fetch('/api/org/waivers')
    if (res.ok) {
      const data = await res.json()
      setWaivers(data.waivers || [])
    }
    setWaiversLoading(false)
  }

  useEffect(() => {
    if (!orgId) return
    loadWaivers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  const handleCreateWaiver = async () => {
    if (!newWaiverTitle.trim() || !newWaiverBody.trim()) {
      setWaiverNotice('Title and body are required.')
      return
    }
    setWaiverSaving(true)
    setWaiverNotice('')
    const res = await fetch('/api/org/waivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newWaiverTitle.trim(), body: newWaiverBody.trim(), required_roles: newWaiverRoles }),
    })
    const data = await res.json()
    if (!res.ok) {
      setWaiverNotice(data.error || 'Failed to create waiver.')
      setWaiverSaving(false)
      return
    }
    setWaivers((prev) => [{ ...data.waiver, signature_count: 0 }, ...prev])
    setShowCreateWaiver(false)
    setNewWaiverTitle('')
    setNewWaiverBody('')
    setNewWaiverRoles(['athlete'])
    setWaiverSaving(false)
  }

  const handleToggleWaiver = async (id: string, current: boolean) => {
    const res = await fetch('/api/org/waivers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !current }),
    })
    if (res.ok) {
      setWaivers((prev) => prev.map((w) => w.id === id ? { ...w, is_active: !current } : w))
    }
  }

  const handleExpandWaiver = async (waiverId: string) => {
    if (expandedWaiverId === waiverId) { setExpandedWaiverId(null); return }
    setExpandedWaiverId(waiverId)
    if (drilldownData[waiverId]) return
    setDrilldownLoading(waiverId)
    const res = await fetch(`/api/org/waivers?waiver_id=${waiverId}`)
    if (res.ok) {
      const data = await res.json()
      setDrilldownData((prev) => ({ ...prev, [waiverId]: { signed: data.signed || [], unsigned: data.unsigned || [] } }))
    }
    setDrilldownLoading(null)
  }

  const planActive = isOrgPlanActive(planStatus)
  const complianceEnabled = planActive && ORG_FEATURES[orgTier].complianceTools

  const config = useMemo(() => getOrgTypeConfig(orgType), [orgType])
  const checklist = useMemo(() => config.compliance.checklist, [config.compliance.checklist])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!planActive) {
      setNotice('Activate billing to upload compliance documents.')
      event.target.value = ''
      return
    }
    if (!ORG_FEATURES[orgTier].complianceTools) {
      setNotice('Upgrade to Growth or Enterprise to upload compliance documents.')
      event.target.value = ''
      return
    }
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setNotice('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('scope', 'org_compliance')
    const response = await fetch('/api/storage/attachment', {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      setNotice('Unable to upload document.')
      setUploading(false)
      return
    }
    const payload = await response.json()
    setUploads((prev) => [
      { name: payload.name, url: payload.url, createdAt: 'Just now' },
      ...prev,
    ])
    setUploading(false)
    event.target.value = ''
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Compliance</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">{config.compliance.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/org/settings#export-center"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Eligibility checklist</h2>
              {!planActive ? (
                <div className="mt-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                  Billing status: {formatTierName(planStatus)}. Activate billing to use compliance tools.
                </div>
              ) : !ORG_FEATURES[orgTier].complianceTools ? (
                <div className="mt-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                  Compliance tools are available on Growth or Enterprise. Current plan: {formatTierName(orgTier)}.
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 text-sm">
                {checklist.map((item) => (
                  <label key={item} className="flex items-start gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <input type="checkbox" className="mt-1 h-4 w-4 border-[#191919]" disabled={!complianceEnabled} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Waivers</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">
                    Create digital waivers that members sign directly on the platform.
                  </p>
                </div>
                {complianceEnabled && (
                  <button
                    type="button"
                    onClick={() => { setShowCreateWaiver((v) => !v); setWaiverNotice('') }}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  >
                    {showCreateWaiver ? 'Cancel' : 'Create waiver'}
                  </button>
                )}
              </div>

              {!complianceEnabled && (
                <div className="mt-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                  Digital waivers are available on Growth or Enterprise.
                </div>
              )}

              {showCreateWaiver && (
                <div className="mt-4 space-y-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <div>
                    <label className="text-xs font-semibold text-[#4a4a4a]">Waiver title</label>
                    <input
                      value={newWaiverTitle}
                      onChange={(e) => setNewWaiverTitle(e.target.value)}
                      placeholder="e.g. Season participation waiver"
                      className="mt-1 w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#4a4a4a]">Waiver text</label>
                    <textarea
                      value={newWaiverBody}
                      onChange={(e) => setNewWaiverBody(e.target.value)}
                      rows={6}
                      placeholder="Enter the full waiver text that members will read and agree to..."
                      className="mt-1 w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#4a4a4a]">Required for</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      {['athlete', 'coach', 'assistant_coach'].map((role) => (
                        <label key={role} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={newWaiverRoles.includes(role)}
                            onChange={(e) =>
                              setNewWaiverRoles((prev) =>
                                e.target.checked ? [...prev, role] : prev.filter((r) => r !== role)
                              )
                            }
                          />
                          <span className="capitalize">{role.replace('_', ' ')}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {waiverNotice && <p className="text-xs text-[#b80f0a]">{waiverNotice}</p>}
                  <button
                    type="button"
                    onClick={handleCreateWaiver}
                    disabled={waiverSaving}
                    className="rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {waiverSaving ? 'Saving…' : 'Save waiver'}
                  </button>
                </div>
              )}

              <div className="mt-4 space-y-3 text-sm">
                {waiversLoading ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#4a4a4a]">
                    Loading waivers…
                  </div>
                ) : waivers.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#4a4a4a]">
                    No waivers created yet.
                  </div>
                ) : (
                  waivers.map((w) => {
                    const isExpanded = expandedWaiverId === w.id
                    const dd = drilldownData[w.id]
                    const isLoadingDd = drilldownLoading === w.id
                    return (
                      <div key={w.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[#191919]">{w.title}</p>
                            <p className="mt-0.5 text-xs text-[#4a4a4a]">
                              {w.signature_count} signature{w.signature_count !== 1 ? 's' : ''} &middot;{' '}
                              Required for: {(w.required_roles as string[]).join(', ')} &middot;{' '}
                              <span className={w.is_active ? 'text-green-700' : 'text-[#b80f0a]'}>
                                {w.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleExpandWaiver(w.id)}
                              className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              {isExpanded ? 'Hide' : 'View signatures'}
                            </button>
                            {complianceEnabled && (
                              <button
                                type="button"
                                onClick={() => handleToggleWaiver(w.id, w.is_active)}
                                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                              >
                                {w.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 space-y-3 border-t border-[#dcdcdc] pt-3 text-xs">
                            {isLoadingDd ? (
                              <p className="text-[#4a4a4a]">Loading…</p>
                            ) : !dd ? (
                              <p className="text-[#4a4a4a]">Unable to load signature data.</p>
                            ) : (
                              <>
                                <div>
                                  <p className="font-semibold text-green-700">
                                    Signed ({dd.signed.length})
                                  </p>
                                  {dd.signed.length === 0 ? (
                                    <p className="mt-1 text-[#4a4a4a]">No signatures yet.</p>
                                  ) : (
                                    <ul className="mt-1 space-y-1">
                                      {dd.signed.map((s) => (
                                        <li key={s.user_id} className="flex items-center justify-between rounded-xl border border-[#dcdcdc] bg-white px-3 py-1.5">
                                          <span className="font-medium text-[#191919]">{s.full_name}</span>
                                          <span className="text-[#4a4a4a]">
                                            {s.email ? `${s.email} · ` : ''}
                                            {s.signed_at ? new Date(s.signed_at).toLocaleDateString() : ''}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                {dd.unsigned.length > 0 && (
                                  <div>
                                    <p className="font-semibold text-[#b80f0a]">
                                      Not yet signed ({dd.unsigned.length})
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {dd.unsigned.map((u) => (
                                        <li key={u.user_id} className="flex items-center justify-between rounded-xl border border-[#dcdcdc] bg-white px-3 py-1.5">
                                          <span className="font-medium text-[#191919]">{u.full_name}</span>
                                          {u.email && <span className="text-[#4a4a4a]">{u.email}</span>}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Documents</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Upload waivers, insurance, or clearance forms.</p>
                </div>
                <label className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]">
                  {uploading ? 'Uploading...' : 'Upload document'}
                  <input type="file" className="hidden" onChange={handleUpload} disabled={!complianceEnabled} />
                </label>
              </div>
              {notice ? <p className="mt-3 text-xs text-[#4a4a4a]">{notice}</p> : null}
              <div className="mt-4 space-y-3 text-sm">
                {uploads.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#4a4a4a]">
                    No documents uploaded yet.
                  </div>
                ) : (
                  uploads.map((item) => (
                    <a
                      key={item.url}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-[#191919]">{item.name}</p>
                        <p className="text-xs text-[#4a4a4a]">{item.createdAt}</p>
                      </div>
                      <span className="text-xs font-semibold text-[#b80f0a]">View</span>
                    </a>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
