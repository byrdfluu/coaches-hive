'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { getOrgTypeConfig, normalizeOrgType, ORG_TYPE_OPTIONS } from '@/lib/orgTypeConfig'
import { normalizeOrgTier } from '@/lib/planRules'

type WizardStep = 'welcome' | 'org-details' | 'create-team' | 'invite-coach' | 'done'

const STEPS: WizardStep[] = ['welcome', 'org-details', 'create-team', 'invite-coach', 'done']

const WIZARD_KEY = 'ch_org_wizard_v1'

export default function OrgOnboardingPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()

  const [step, setStep] = useState<WizardStep | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState('organization')
  const [teamName, setTeamName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const orgConfig = useMemo(() => getOrgTypeConfig(orgType), [orgType])
  const teamLabel = useMemo(() => {
    const label = orgConfig.portal.teamsLabel
    return label.endsWith('s') ? label.slice(0, -1).toLowerCase() : label.toLowerCase()
  }, [orgConfig.portal.teamsLabel])

  const loadData = useCallback(async () => {
    if (typeof window !== 'undefined' && localStorage.getItem(WIZARD_KEY)) {
      router.replace('/org')
      return
    }

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .maybeSingle()

    const existingOrgId = membership?.org_id || null

    const { data: { user } } = await supabase.auth.getUser()
    const metaOrgName = String(user?.user_metadata?.org_name || '').trim()
    const metaOrgType = normalizeOrgType(String(user?.user_metadata?.org_type || ''))

    if (existingOrgId) {
      // Load org name for the welcome heading
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('name, org_type')
        .eq('id', existingOrgId)
        .maybeSingle()
      setOrgId(existingOrgId)
      setOrgName(orgRow?.name || metaOrgName)
      setOrgType(orgRow?.org_type || metaOrgType)
      setStep('welcome')
    } else {
      // No org yet — skip welcome, go straight to org details
      setOrgName(metaOrgName)
      setOrgType(metaOrgType)
      setStep('org-details')
    }
  }, [supabase, router])

  useEffect(() => {
    loadData()
  }, [loadData])

  const advance = (next: WizardStep) => {
    setError('')
    setStep(next)
  }

  const handleOrgDetails = async () => {
    if (!orgName.trim()) {
      setError('Enter your organization name.')
      return
    }
    setSaving(true)
    setError('')

    if (orgId) {
      // Org exists — update name/type
      const res = await fetch('/api/org/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_name: orgName.trim(), org_type: orgType }),
      })
      setSaving(false)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Unable to update organization.')
        return
      }
    } else {
      // No org yet — create it
      const { data: { user } } = await supabase.auth.getUser()
      const tier = normalizeOrgTier(String(user?.user_metadata?.selected_tier || 'standard'))
      const res = await fetch('/api/org/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_name: orgName.trim(), org_type: orgType, tier }),
      })
      const data = await res.json().catch(() => null)
      setSaving(false)
      if (!res.ok && res.status !== 409) {
        setError(data?.error || 'Unable to create organization.')
        return
      }
      const createdOrgId = data?.org?.id || data?.org_id
      if (createdOrgId) setOrgId(createdOrgId)

      // Set active role after org creation
      const checkoutRole = data?.membership_role || 'org_admin'
      await fetch('/api/roles/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: checkoutRole }),
      }).catch(() => null)
      await supabase.auth.refreshSession().catch(() => null)
    }

    advance('create-team')
  }

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      advance('invite-coach')
      return
    }
    setSaving(true)
    setError('')

    const membershipRes = await supabase
      .from('organization_memberships')
      .select('org_id')
      .maybeSingle()
    const currentOrgId = orgId || membershipRes.data?.org_id

    if (currentOrgId) {
      const { error: dbError } = await supabase
        .from('org_teams')
        .insert({ org_id: currentOrgId, name: teamName.trim() })
      if (dbError) {
        setSaving(false)
        setError('Unable to create team. Try again.')
        return
      }
      if (!orgId) setOrgId(currentOrgId)
    }

    setSaving(false)
    advance('invite-coach')
  }

  const handleInviteCoach = async () => {
    if (!inviteEmail.trim()) {
      markDone()
      return
    }
    setSaving(true)
    setError('')

    const membershipRes = await supabase
      .from('organization_memberships')
      .select('org_id')
      .maybeSingle()
    const currentOrgId = orgId || membershipRes.data?.org_id

    if (currentOrgId) {
      const res = await fetch('/api/org/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: currentOrgId, role: 'coach', invited_email: inviteEmail.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setSaving(false)
        setError(data?.error || 'Unable to send invite.')
        return
      }
    }

    setSaving(false)
    markDone()
  }

  const markDone = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(WIZARD_KEY, '1')
    }
    setStep('done')
  }

  const stepIndex = step ? STEPS.indexOf(step) : -1

  if (step === null) {
    return (
      <main className="flex min-h-[85vh] items-center justify-center px-4">
        <p className="text-sm text-[#4a4a4a]">Loading...</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-[85vh] flex-col items-center justify-center px-4 py-10">
      {/* Progress dots */}
      {step !== 'done' && (
        <div className="mb-8 flex items-center gap-2">
          {STEPS.filter((s) => s !== 'done').map((s, i) => (
            <span
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? 'w-6 bg-[#191919]'
                  : i < stepIndex
                  ? 'w-2 bg-[#191919]'
                  : 'w-2 bg-[#dcdcdc]'
              }`}
            />
          ))}
        </div>
      )}

      <div className="w-full max-w-md">
        {/* Step 1: Welcome */}
        {step === 'welcome' && (
          <div className="rounded-3xl border border-[#191919] bg-white p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Welcome</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#191919]">
              {orgName ? `You're in. Let's set up ${orgName}.` : "You're in. Let's set up your program."}
            </h1>
            <p className="mt-3 text-sm text-[#4a4a4a]">
              We'll walk you through the basics so your program is ready to run in under two minutes.
            </p>
            <button
              type="button"
              onClick={() => advance('org-details')}
              className="mt-6 rounded-full bg-[#191919] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Get started →
            </button>
          </div>
        )}

        {/* Step 2: Confirm org details */}
        {step === 'org-details' && (
          <div className="rounded-3xl border border-[#191919] bg-white p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Your organization</p>
            <h2 className="mt-2 text-xl font-semibold text-[#191919]">Confirm your details</h2>
            <p className="mt-1 text-sm text-[#4a4a4a]">
              We'll use this to personalize your portal.
            </p>
            <div className="mt-6 grid gap-4">
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold text-[#191919]">Organization name</span>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleOrgDetails()}
                  placeholder="e.g. Westside Athletic Club"
                  autoFocus
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold text-[#191919]">Organization type</span>
                <select
                  value={orgType}
                  onChange={(e) => setOrgType(e.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919]"
                >
                  {ORG_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  <option value="organization">Other organization</option>
                </select>
              </label>
            </div>
            {error && <p className="mt-3 text-xs text-[#b80f0a]">{error}</p>}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={handleOrgDetails}
                disabled={saving}
                className="rounded-full bg-[#191919] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save & continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Create first team */}
        {step === 'create-team' && (
          <div className="rounded-3xl border border-[#191919] bg-white p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Step 1 of 2</p>
            <h2 className="mt-2 text-xl font-semibold text-[#191919]">
              Create your first {teamLabel}
            </h2>
            <p className="mt-1 text-sm text-[#4a4a4a]">
              You can add more {orgConfig.portal.teamsLabel.toLowerCase()} and rosters from the dashboard.
            </p>
            <div className="mt-6">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                placeholder={`e.g. U14 Boys`}
                autoFocus
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
              />
            </div>
            {error && <p className="mt-3 text-xs text-[#b80f0a]">{error}</p>}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={handleCreateTeam}
                disabled={saving}
                className="rounded-full bg-[#191919] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? 'Creating...' : teamName.trim() ? `Create ${teamLabel}` : 'Skip'}
              </button>
              {teamName.trim() && (
                <button
                  type="button"
                  onClick={() => { setTeamName(''); advance('invite-coach') }}
                  className="text-sm text-[#4a4a4a] underline-offset-2 hover:underline"
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Invite a coach */}
        {step === 'invite-coach' && (
          <div className="rounded-3xl border border-[#191919] bg-white p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Step 2 of 2</p>
            <h2 className="mt-2 text-xl font-semibold text-[#191919]">Invite your first coach</h2>
            <p className="mt-1 text-sm text-[#4a4a4a]">
              They'll receive an email to join your organization and can start running sessions right away.
            </p>
            <div className="mt-6">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInviteCoach()}
                placeholder="coach@example.com"
                autoFocus
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
              />
            </div>
            {error && <p className="mt-3 text-xs text-[#b80f0a]">{error}</p>}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={handleInviteCoach}
                disabled={saving}
                className="rounded-full bg-[#191919] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? 'Sending...' : inviteEmail.trim() ? 'Send invite' : 'Skip'}
              </button>
              {inviteEmail.trim() && (
                <button
                  type="button"
                  onClick={() => { setInviteEmail(''); markDone() }}
                  className="text-sm text-[#4a4a4a] underline-offset-2 hover:underline"
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 'done' && (
          <div className="rounded-3xl border border-[#191919] bg-white p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f0faf4]">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#2f7a4f]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-[#191919]">Your program is ready.</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Head to your dashboard to manage teams, track athletes, and run your season.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Link
                href="/org"
                className="w-full rounded-full bg-[#191919] px-6 py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Go to dashboard →
              </Link>
              <Link
                href="/org/coaches"
                className="text-sm text-[#4a4a4a] underline-offset-2 hover:underline"
              >
                Add more coaches
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
