'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { getOrgTypeConfig, normalizeOrgType } from '@/lib/orgTypeConfig'
import { normalizeOrgTier } from '@/lib/planRules'

const ORG_TYPE_OPTIONS = [
  { value: 'club', label: 'Sports club' },
  { value: 'school', label: 'School / Athletic dept.' },
  { value: 'travel', label: 'Travel team' },
  { value: 'academy', label: 'Academy' },
  { value: 'organization', label: 'Other organization' },
]

type Task = {
  id: string
  title: string
  description: string
  done: boolean
  action?: { label: string; href?: string; onClick?: () => void }
}

export default function OrgOnboardingPage() {
  const supabase = createClientComponentClient()

  // ── org state ───────────────────────────────────────────────────────────────
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgType, setOrgType] = useState('organization')
  const [loading, setLoading] = useState(true)

  // ── checklist counts ────────────────────────────────────────────────────────
  const [teamCount, setTeamCount] = useState(0)
  const [coachCount, setCoachCount] = useState(0)
  const [athleteCount, setAthleteCount] = useState(0)
  const [announcementCount, setAnnouncementCount] = useState(0)
  const [stripeConnected, setStripeConnected] = useState(false)

  // ── org creation form ───────────────────────────────────────────────────────
  const [orgName, setOrgName] = useState('')
  const [orgTypeInput, setOrgTypeInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // ── join existing org form ───────────────────────────────────────────────────
  const [joinOrgName, setJoinOrgName] = useState('')
  const [joinTeamName, setJoinTeamName] = useState('')
  const [joinRole, setJoinRole] = useState<'coach' | 'assistant_coach'>('coach')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinNotice, setJoinNotice] = useState('')
  const [joinSent, setJoinSent] = useState(false)

  // ── active inline modal ─────────────────────────────────────────────────────
  const [activeModal, setActiveModal] = useState<string | null>(null)

  // ── team modal ──────────────────────────────────────────────────────────────
  const [teamName, setTeamName] = useState('')
  const [teamSaving, setTeamSaving] = useState(false)
  const [teamNotice, setTeamNotice] = useState('')

  // ── invite modal ────────────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'coach' | 'athlete'>('coach')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteNotice, setInviteNotice] = useState('')

  // ── announcement modal ──────────────────────────────────────────────────────
  const [announceTitle, setAnnounceTitle] = useState('')
  const [announceBody, setAnnounceBody] = useState('')
  const [announceSaving, setAnnounceSaving] = useState(false)
  const [announceNotice, setAnnounceNotice] = useState('')

  const getSelectedOrgTier = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return normalizeOrgTier(String(user?.user_metadata?.selected_tier || 'standard'))
  }, [supabase])

  const continueToOrgPlans = useCallback(async (checkoutRole: string) => {
    const selectedTier = await getSelectedOrgTier()
    const roleResponse = await fetch('/api/roles/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: checkoutRole }),
    }).catch(() => null)
    if (!roleResponse?.ok) {
      const payload = await roleResponse?.json().catch(() => null)
      setCreateError(payload?.error || 'Organization was created, but account role setup failed. Sign in again and retry org setup.')
      return false
    }
    await supabase.auth.refreshSession().catch(() => null)
    if (typeof window !== 'undefined') {
      window.location.assign(
        `/select-plan?role=${encodeURIComponent(checkoutRole)}&tier=${encodeURIComponent(selectedTier)}&force_plan_selection=1`,
      )
    }
    return true
  }, [getSelectedOrgTier, supabase])

  // ── load org data ───────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .maybeSingle()
    const nextOrgId = membership?.org_id || null
    if (!nextOrgId) {
      // Try to auto-create from signup metadata before showing the manual form
      const { data: { user } } = await supabase.auth.getUser()
      const metaOrgName = String(user?.user_metadata?.org_name || '').trim()
      const metaOrgType = String(user?.user_metadata?.org_type || '').trim() || 'organization'
      if (metaOrgName) {
        const selectedTier = normalizeOrgTier(String(user?.user_metadata?.selected_tier || 'standard'))
        const res = await fetch('/api/org/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_name: metaOrgName, org_type: metaOrgType, tier: selectedTier }),
        })
        const payload = await res.json().catch(() => null)
        const created = res.ok || (res.status === 409 && payload?.org)
        if (created) {
          const checkoutRole = String(payload?.membership_role || payload?.org?.role || 'org_admin')
          const checkoutStarted = await continueToOrgPlans(checkoutRole)
          if (checkoutStarted) {
            return
          }
        }
        if (created) {
          setCreateError('Organization was created, but plan selection could not start.')
          setOrgName(metaOrgName)
          setOrgTypeInput(metaOrgType)
          setLoading(false)
          return
        }
        // Create failed — pre-fill the form and let the user submit manually
        setOrgName(metaOrgName)
        setOrgTypeInput(metaOrgType)
      }
      setOrgId(null)
      setOrgType('organization')
      setLoading(false)
      return
    }

    const [teamRows, coachRows, athleteRows, settingsRow, orgRow, announcePayload] =
      await Promise.all([
        supabase.from('org_teams').select('id').eq('org_id', nextOrgId),
        supabase
          .from('organization_memberships')
          .select('id')
          .eq('org_id', nextOrgId)
          .in('role', ['coach', 'assistant_coach']),
        supabase
          .from('organization_memberships')
          .select('id')
          .eq('org_id', nextOrgId)
          .eq('role', 'athlete'),
        supabase
          .from('org_settings')
          .select('stripe_account_id')
          .eq('org_id', nextOrgId)
          .maybeSingle(),
        supabase.from('organizations').select('org_type').eq('id', nextOrgId).maybeSingle(),
        fetch('/api/org/messages/announcements')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])

    // Org exists — go straight to the dashboard
    if (typeof window !== 'undefined') {
      window.location.replace('/org')
    }
  }, [continueToOrgPlans, supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── join existing org ────────────────────────────────────────────────────────
  const handleJoinOrg = async () => {
    if (!joinOrgName.trim()) {
      setJoinNotice('Enter the organization name.')
      return
    }
    setJoinLoading(true)
    setJoinNotice('')
    const res = await fetch('/api/org/join-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_name: joinOrgName.trim(),
        team_name: joinTeamName.trim() || null,
        role: joinRole,
      }),
    })
    const payload = await res.json().catch(() => null)
    setJoinLoading(false)
    if (!res.ok) {
      setJoinNotice(payload?.error || 'Unable to send join request.')
      return
    }
    setJoinSent(true)
    setJoinNotice(`Request sent to ${payload?.org_name || 'the organization'}. You'll get access once an admin approves it.`)
  }

  // ── create org ──────────────────────────────────────────────────────────────
  const handleCreateOrg = async () => {
    if (!orgName.trim()) {
      setCreateError('Enter your organization name.')
      return
    }
    if (!orgTypeInput) {
      setCreateError('Select your organization type.')
      return
    }
    setCreating(true)
    setCreateError('')
    const selectedTier = await getSelectedOrgTier()
    const res = await fetch('/api/org/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_name: orgName.trim(), org_type: orgTypeInput, tier: selectedTier }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 409 && data?.org) {
        const resumed = await continueToOrgPlans(String(data?.org?.role || 'org_admin'))
        if (resumed) return
        setCreating(false)
        return
      }
      setCreateError(data.error || 'Unable to create organization.')
      setCreating(false)
      return
    }
    const checkoutStarted = await continueToOrgPlans(String(data?.membership_role || 'org_admin'))
    if (!checkoutStarted) {
      setCreating(false)
      return
    }
  }

  // ── create team ─────────────────────────────────────────────────────────────
  const handleCreateTeam = async () => {
    if (!orgId || !teamName.trim()) {
      setTeamNotice('Enter a team name.')
      return
    }
    setTeamSaving(true)
    const { error } = await supabase
      .from('org_teams')
      .insert({ org_id: orgId, name: teamName.trim() })
    if (error) {
      setTeamNotice('Unable to create team.')
      setTeamSaving(false)
      return
    }
    setTeamCount((c) => c + 1)
    setTeamName('')
    setTeamNotice('')
    setActiveModal(null)
    setTeamSaving(false)
  }

  // ── invite ──────────────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!orgId || !inviteEmail.trim()) {
      setInviteNotice('Enter an email address.')
      return
    }
    setInviteSaving(true)
    const res = await fetch('/api/org/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, role: inviteRole, invited_email: inviteEmail.trim() }),
    })
    const data = await res.json()
    if (!res.ok) {
      setInviteNotice(data.error || 'Unable to send invite.')
      setInviteSaving(false)
      return
    }
    if (inviteRole === 'coach') setCoachCount((c) => c + 1)
    else setAthleteCount((c) => c + 1)
    setInviteEmail('')
    setInviteNotice('')
    setActiveModal(null)
    setInviteSaving(false)
  }

  // ── post announcement ───────────────────────────────────────────────────────
  const handlePostAnnouncement = async () => {
    if (!announceTitle.trim() || !announceBody.trim()) {
      setAnnounceNotice('Title and message are required.')
      return
    }
    setAnnounceSaving(true)
    const res = await fetch('/api/org/messages/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: announceTitle.trim(),
        body: announceBody.trim(),
        audience: 'All',
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      setAnnounceNotice(data.error || 'Unable to post announcement.')
      setAnnounceSaving(false)
      return
    }
    setAnnouncementCount(1)
    setAnnounceTitle('')
    setAnnounceBody('')
    setAnnounceNotice('')
    setActiveModal(null)
    setAnnounceSaving(false)
  }

  // ── config ──────────────────────────────────────────────────────────────────
  const orgConfig = useMemo(() => getOrgTypeConfig(orgType), [orgType])
  const singularTeam = useMemo(() => {
    const label = orgConfig.portal.teamsLabel
    return label.endsWith('s') ? label.slice(0, -1) : label
  }, [orgConfig.portal.teamsLabel])

  const tasks: Task[] = useMemo(
    () => [
      {
        id: 'team',
        title: `Create your first ${singularTeam.toLowerCase()}`,
        description: `Set up ${orgConfig.portal.teamsLabel.toLowerCase()} and rosters.`,
        done: teamCount > 0,
        action: {
          label: `Create ${singularTeam.toLowerCase()}`,
          onClick: () => setActiveModal('team'),
        },
      },
      {
        id: 'coach',
        title: 'Invite your first coach',
        description: 'Add coaching staff so they can run sessions.',
        done: coachCount > 0,
        action: {
          label: 'Invite coach',
          onClick: () => {
            setInviteRole('coach')
            setInviteEmail('')
            setInviteNotice('')
            setActiveModal('invite')
          },
        },
      },
      {
        id: 'athlete',
        title: 'Invite your first athlete',
        description: 'Add athletes to your organization.',
        done: athleteCount > 0,
        action: {
          label: 'Invite athlete',
          onClick: () => {
            setInviteRole('athlete')
            setInviteEmail('')
            setInviteNotice('')
            setActiveModal('invite')
          },
        },
      },
      {
        id: 'announcement',
        title: 'Post your first announcement',
        description: 'Send a message to all coaches and athletes.',
        done: announcementCount > 0,
        action: {
          label: 'Post announcement',
          onClick: () => setActiveModal('announcement'),
        },
      },
      {
        id: 'stripe',
        title: 'Connect billing',
        description: 'Enable Stripe to collect dues, fees, and payouts.',
        done: stripeConnected,
        action: { label: 'Connect Stripe', href: '/org/settings' },
      },
    ],
    [
      singularTeam,
      orgConfig.portal.teamsLabel,
      teamCount,
      coachCount,
      athleteCount,
      announcementCount,
      stripeConnected,
    ],
  )

  // ── sync progress ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || !orgId) return
    const doneIds = tasks.filter((t) => t.done).map((t) => t.id)
    fetch('/api/org/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, completed_steps: doneIds, total_steps: tasks.length }),
    })
  }, [loading, orgId, tasks])

  const completed = tasks.filter((t) => t.done).length
  const allDone = completed === tasks.length

  // ── loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
          <p className="text-sm text-[#4a4a4a]">Loading...</p>
        </div>
      </main>
    )
  }

  // ── phase 1: no org yet ─────────────────────────────────────────────────────
  if (!orgId) {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto max-w-lg px-4 sm:px-6 py-10 sm:py-16">
          <div className="glass-card border border-[#191919] bg-white p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Get started</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#191919]">
              Set up your organization
            </h1>
            <p className="mt-1 text-sm text-[#4a4a4a]">
              Create your org to manage teams, coaches, and athletes in one hub.
            </p>
            <div className="mt-6 grid gap-4">
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-[#191919]">Organization name</span>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
                  placeholder="e.g. Westside Athletic Club"
                  autoFocus
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-[#191919]">Organization type</span>
                <select
                  value={orgTypeInput}
                  onChange={(e) => setOrgTypeInput(e.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919]"
                >
                  <option value="" disabled>
                    Select Your Org Type
                  </option>
                  {ORG_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {createError && <p className="mt-3 text-xs text-[#b80f0a]">{createError}</p>}
            <div className="mt-5">
              <button
                type="button"
                onClick={handleCreateOrg}
                disabled={creating}
                className="rounded-full bg-[#191919] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create organization'}
              </button>
            </div>

            <div className="mt-8 border-t border-[#dcdcdc] pt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">Joining an existing org?</p>
              <p className="mt-1 text-xs text-[#4a4a4a]">Enter the org name and we&apos;ll notify their admin to approve your access.</p>
              {joinSent ? (
                <p className="mt-3 text-xs font-semibold text-[#2f7a4f]">{joinNotice}</p>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  <input
                    type="text"
                    placeholder="Organization name"
                    value={joinOrgName}
                    onChange={(e) => setJoinOrgName(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  />
                  <input
                    type="text"
                    placeholder="Team name (optional)"
                    value={joinTeamName}
                    onChange={(e) => setJoinTeamName(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  />
                  <select
                    value={joinRole}
                    onChange={(e) => setJoinRole(e.target.value as 'coach' | 'assistant_coach')}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919]"
                  >
                    <option value="coach">Coach</option>
                    <option value="assistant_coach">Assistant coach</option>
                  </select>
                  {joinNotice && <p className="text-xs text-[#b80f0a]">{joinNotice}</p>}
                  <button
                    type="button"
                    onClick={handleJoinOrg}
                    disabled={joinLoading}
                    className="self-start rounded-full border border-[#191919] px-5 py-2 text-sm font-semibold text-[#191919] transition-opacity hover:opacity-80 disabled:opacity-60"
                  >
                    {joinLoading ? 'Sending...' : 'Request to join'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    )
  }

  // ── phase 2: checklist ──────────────────────────────────────────────────────
  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Onboarding</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">
              Launch your {orgConfig.label.toLowerCase()} portal.
            </h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Complete the setup to manage {orgConfig.portal.teamsLabel.toLowerCase()} in one hub.
            </p>
          </div>
          <Link
            href="/org"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
          >
            {allDone ? 'Go to dashboard' : 'Skip for now'}
          </Link>
        </header>

        <section className="mt-8 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <p className="font-semibold text-[#191919]">Progress</p>
            <p className="text-[#4a4a4a]">
              {completed}/{tasks.length} complete
            </p>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0f0]">
            <div
              className="h-full rounded-full bg-[#191919] transition-all duration-500"
              style={{ width: `${(completed / tasks.length) * 100}%` }}
            />
          </div>

          {allDone && (
            <div className="rounded-2xl border border-[#2f7a4f] bg-[#f0faf4] px-4 py-3 text-sm font-semibold text-[#2f7a4f]">
              All done! Your portal is ready.{' '}
              <Link href="/org" className="underline">
                Go to dashboard →
              </Link>
            </div>
          )}

          <div className="grid gap-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`glass-card border bg-white p-5 ${
                  task.done ? 'border-[#d0ead8]' : 'border-[#191919]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        task.done
                          ? 'bg-[#2f7a4f] text-white'
                          : 'border border-[#dcdcdc] text-[#9a9a9a]'
                      }`}
                    >
                      {task.done ? '✓' : ''}
                    </span>
                    <div>
                      <p
                        className={`text-base font-semibold ${
                          task.done ? 'text-[#9a9a9a] line-through' : 'text-[#191919]'
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="mt-0.5 text-sm text-[#4a4a4a]">{task.description}</p>
                    </div>
                  </div>
                  {!task.done && task.action && (
                    task.action.href ? (
                      <Link
                        href={task.action.href}
                        className="rounded-full border border-[#191919] px-3 py-1.5 text-xs font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                      >
                        {task.action.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={task.action.onClick}
                        className="rounded-full border border-[#191919] px-3 py-1.5 text-xs font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                      >
                        {task.action.label}
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Create team modal ──────────────────────────────────────────────── */}
      {activeModal === 'team' && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[calc(100vw-2rem)] rounded-3xl border border-[#191919] bg-white p-6 shadow-xl sm:max-w-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
                  New {singularTeam.toLowerCase()}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#191919]">
                  Create {singularTeam.toLowerCase()}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  setTeamNotice('')
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold"
              >
                ×
              </button>
            </div>
            <div className="mt-4">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                placeholder={`${singularTeam} name`}
                autoFocus
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
              />
              {teamNotice && <p className="mt-2 text-xs text-[#b80f0a]">{teamNotice}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleCreateTeam}
                disabled={teamSaving}
                className="rounded-full bg-[#191919] px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {teamSaving ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  setTeamNotice('')
                }}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite modal ────────────────────────────────────────────────────── */}
      {activeModal === 'invite' && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[calc(100vw-2rem)] rounded-3xl border border-[#191919] bg-white p-6 shadow-xl sm:max-w-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Invite</p>
                <h2 className="mt-1 text-lg font-semibold text-[#191919]">
                  Invite {inviteRole}
                </h2>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  They&apos;ll receive an email to join your organization.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  setInviteEmail('')
                  setInviteNotice('')
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold"
              >
                ×
              </button>
            </div>
            <div className="mt-4">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="Email address"
                autoFocus
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
              />
              {inviteNotice && <p className="mt-2 text-xs text-[#b80f0a]">{inviteNotice}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleInvite}
                disabled={inviteSaving}
                className="rounded-full bg-[#191919] px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {inviteSaving ? 'Sending...' : 'Send invite'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  setInviteEmail('')
                  setInviteNotice('')
                }}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Announcement modal ───────────────────────────────────────────────── */}
      {activeModal === 'announcement' && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[calc(100vw-2rem)] rounded-3xl border border-[#191919] bg-white p-6 shadow-xl sm:max-w-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
                  Announcement
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#191919]">Post announcement</h2>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  Sent to all coaches and athletes in your organization.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  setAnnounceNotice('')
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <input
                type="text"
                value={announceTitle}
                onChange={(e) => setAnnounceTitle(e.target.value)}
                placeholder="Title"
                autoFocus
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
              />
              <textarea
                value={announceBody}
                onChange={(e) => setAnnounceBody(e.target.value)}
                rows={4}
                placeholder="Write your message..."
                className="w-full resize-none rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
              />
              {announceNotice && <p className="text-xs text-[#b80f0a]">{announceNotice}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handlePostAnnouncement}
                disabled={announceSaving}
                className="rounded-full bg-[#191919] px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {announceSaving ? 'Posting...' : 'Post announcement'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  setAnnounceNotice('')
                }}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
