'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import { ORG_FEATURES, formatTierName, isOrgPlanActive, normalizeOrgStatus, normalizeOrgTier } from '@/lib/planRules'
import { getOrgTypeConfig, normalizeOrgType } from '@/lib/orgTypeConfig'

type OrgTeamRow = Record<string, any>
type ProfileRow = Record<string, any>
type TeamMemberRow = {
  team_id?: string | null
  athlete_id?: string | null
}

type AthleteMetric = {
  athlete_id: string
  label: string
  value: string
  unit?: string | null
}

type AthleteResult = {
  athlete_id: string
  title: string
  event_date?: string | null
  placement?: string | null
  detail?: string | null
}

type AthleteMedia = {
  athlete_id: string
  title?: string | null
  media_url: string
  media_type?: string | null
}

type VisibilityRow = {
  athlete_id: string
  section: string
  visibility: string
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export default function OrgTeamsPage() {
  const supabase = createClientComponentClient()
  const [teams, setTeams] = useState<OrgTeamRow[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({})
  const [orgName, setOrgName] = useState('Organization')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgType, setOrgType] = useState('organization')
  const [orgTier, setOrgTier] = useState<'standard' | 'growth' | 'enterprise'>('standard')
  const [planStatus, setPlanStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled'>('trialing')
  const [activeTeam, setActiveTeam] = useState<OrgTeamRow | null>(null)
  const [athleteEmail, setAthleteEmail] = useState('')
  const [rosterNotice, setRosterNotice] = useState('')
  const [rosterSaving, setRosterSaving] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importTeamId, setImportTeamId] = useState('')
  const [importText, setImportText] = useState('')
  const [importNotice, setImportNotice] = useState('')
  const [importSaving, setImportSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [practicePlans, setPracticePlans] = useState<any[]>([])
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null)
  const [inviteAthleteEmail, setInviteAthleteEmail] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [createTeamSaving, setCreateTeamSaving] = useState(false)
  const [createTeamNotice, setCreateTeamNotice] = useState('')
  const [teamSport, setTeamSport] = useState('')
  const [teamAgeRange, setTeamAgeRange] = useState('')
  const [teamGrade, setTeamGrade] = useState('')
  const [teamLevel, setTeamLevel] = useState('')
  const [teamNotes, setTeamNotes] = useState('')
  const [teamCoachEmail, setTeamCoachEmail] = useState('')
  const [teamAthleteEmails, setTeamAthleteEmails] = useState('')
  const [detailTeam, setDetailTeam] = useState<OrgTeamRow | null>(null)
  const [profileAthlete, setProfileAthlete] = useState<ProfileRow | null>(null)
  const [profileTeamId, setProfileTeamId] = useState<string | null>(null)
  const [profileReturnTeam, setProfileReturnTeam] = useState<OrgTeamRow | null>(null)
  const [metricsByAthlete, setMetricsByAthlete] = useState<Record<string, AthleteMetric[]>>({})
  const [resultsByAthlete, setResultsByAthlete] = useState<Record<string, AthleteResult[]>>({})
  const [mediaByAthlete, setMediaByAthlete] = useState<Record<string, AthleteMedia[]>>({})
  const [visibilityByAthlete, setVisibilityByAthlete] = useState<Record<string, Record<string, string>>>({})
  const planActive = isOrgPlanActive(planStatus)
  const teamCreationEnabled = planActive && ORG_FEATURES[orgTier].teamCreation
  const statusLabel = formatTierName(planStatus)
  const tierLabel = formatTierName(orgTier)
  const orgConfig = useMemo(() => getOrgTypeConfig(orgType), [orgType])
  const teamForm = orgConfig.teamForm
  const gradeDisplayLabel = teamForm.gradeLabel || 'Grade level'
  const singularTeamLabel = useMemo(() => {
    const label = orgConfig.portal.teamsLabel
    return label.endsWith('s') ? label.slice(0, -1) : label
  }, [orgConfig.portal.teamsLabel])
  const levelOptions = useMemo(() => ([
    'U6',
    'U8',
    'U10',
    'U12',
    'U14',
    'U16',
    'U18',
    'Freshman',
    'Sophomore',
    'Junior',
    'Senior',
    'JV',
    'Varsity',
    'College',
    'Adult',
    'Masters',
    'Open',
    'Combined',
  ]), [])

  const loadTeams = useCallback(async () => {
    setLoading(true)
    setNotice('')
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) return

    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .maybeSingle()

    const membershipRow = (membership || null) as { org_id?: string | null } | null

    if (membershipError || !membershipRow?.org_id) {
      setNotice('No organization found.')
      setLoading(false)
      return
    }

    setOrgId(membershipRow.org_id)

    const { data: orgSettings } = await supabase
      .from('org_settings')
      .select('plan, plan_status')
      .eq('org_id', membershipRow.org_id)
      .maybeSingle()
    const settingsRow = (orgSettings || null) as { plan?: string | null; plan_status?: string | null } | null
    if (settingsRow?.plan) {
      setOrgTier(normalizeOrgTier(settingsRow.plan))
    }
    if (settingsRow?.plan_status) {
      setPlanStatus(normalizeOrgStatus(settingsRow.plan_status))
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, org_type')
      .eq('id', membershipRow.org_id)
      .maybeSingle()
    const orgRow = (org || null) as { name?: string | null; org_type?: string | null } | null
    if (orgRow?.name) setOrgName(orgRow.name)
    setOrgType(normalizeOrgType(orgRow?.org_type))

    const { data: teamRows, error: teamError } = await supabase
      .from('org_teams')
      .select('id, name, coach_id, created_at')
      .eq('org_id', membershipRow.org_id)
      .order('created_at', { ascending: true })

    if (teamError) {
      setNotice('Unable to load teams.')
      setLoading(false)
      return
    }

    const teamIds = (teamRows || []).map((team) => team.id).filter(Boolean)
    let memberRows: TeamMemberRow[] = []
    if (teamIds.length > 0) {
      const { data: members } = await supabase
        .from('org_team_members')
        .select('team_id, athlete_id')
        .in('team_id', teamIds)
      memberRows = (members || []) as TeamMemberRow[]
    }

    const profileIds = new Set<string>()
    ;(teamRows || []).forEach((team: OrgTeamRow) => {
      if (team.coach_id) profileIds.add(team.coach_id)
    })
    memberRows.forEach((member) => {
      if (member.athlete_id) profileIds.add(member.athlete_id)
    })
    let profileMap: Record<string, ProfileRow> = {}
    if (profileIds.size > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(profileIds))
      ;(profileRows || []).forEach((profile: ProfileRow) => {
        profileMap[profile.id] = profile
      })
    }

    const athleteIds = Array.from(
      new Set(
        memberRows
          .map((member) => member.athlete_id)
          .filter(Boolean) as string[]
      )
    )

    if (athleteIds.length > 0) {
      const [metricsRes, resultsRes, mediaRes, visibilityRes] = await Promise.all([
        supabase
          .from('athlete_metrics')
          .select('athlete_id, label, value, unit')
          .in('athlete_id', athleteIds)
          .order('sort_order', { ascending: true }),
        supabase
          .from('athlete_results')
          .select('athlete_id, title, event_date, placement, detail')
          .in('athlete_id', athleteIds)
          .order('event_date', { ascending: false }),
        supabase
          .from('athlete_media')
          .select('athlete_id, title, media_url, media_type')
          .in('athlete_id', athleteIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('profile_visibility')
          .select('athlete_id, section, visibility')
          .in('athlete_id', athleteIds),
      ])

      const metricRows = (metricsRes.data || []) as AthleteMetric[]
      const metricsMap: Record<string, AthleteMetric[]> = {}
      metricRows.forEach((row) => {
        if (!metricsMap[row.athlete_id]) metricsMap[row.athlete_id] = []
        metricsMap[row.athlete_id].push(row)
      })

      const resultRows = (resultsRes.data || []) as AthleteResult[]
      const resultsMap: Record<string, AthleteResult[]> = {}
      resultRows.forEach((row) => {
        if (!resultsMap[row.athlete_id]) resultsMap[row.athlete_id] = []
        resultsMap[row.athlete_id].push(row)
      })

      const mediaRows = (mediaRes.data || []) as AthleteMedia[]
      const mediaMap: Record<string, AthleteMedia[]> = {}
      mediaRows.forEach((row) => {
        if (!mediaMap[row.athlete_id]) mediaMap[row.athlete_id] = []
        mediaMap[row.athlete_id].push(row)
      })

      const visibilityRows = (visibilityRes.data || []) as VisibilityRow[]
      const visibilityMap: Record<string, Record<string, string>> = {}
      visibilityRows.forEach((row) => {
        if (!visibilityMap[row.athlete_id]) visibilityMap[row.athlete_id] = {}
        visibilityMap[row.athlete_id][row.section] = row.visibility
      })

      setMetricsByAthlete(metricsMap)
      setResultsByAthlete(resultsMap)
      setMediaByAthlete(mediaMap)
      setVisibilityByAthlete(visibilityMap)
    } else {
      setMetricsByAthlete({})
      setResultsByAthlete({})
      setMediaByAthlete({})
      setVisibilityByAthlete({})
    }

    setTeams((teamRows || []) as OrgTeamRow[])
    setTeamMembers(memberRows)
    setProfiles(profileMap)
    const plansResponse = await fetch('/api/practice-plans')
    if (plansResponse.ok) {
      const payload = await plansResponse.json()
      setPracticePlans(payload.plans || [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadTeams()
  }, [loadTeams])

  const ensureMembership = useCallback(
    async (userId: string, role: 'athlete' | 'coach') => {
      if (!orgId) return false
      const { data: existing } = await supabase
        .from('organization_memberships')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .maybeSingle()
      if (existing) return true
      const { error } = await supabase.from('organization_memberships').insert({
        org_id: orgId,
        user_id: userId,
        role,
      })
      return !error
    },
    [orgId, supabase],
  )

  const inviteEmail = useCallback(
    async (email: string, role: 'athlete' | 'coach', teamId?: string | null) => {
      if (!orgId || !email) return
      await fetch('/api/org/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          team_id: teamId,
          role,
          invited_email: email,
        }),
      })
    },
    [orgId],
  )

  const addAthleteToTeam = useCallback(
    async (athleteId: string, teamId: string) => {
      await ensureMembership(athleteId, 'athlete')
      await supabase
        .from('org_team_members')
        .upsert({ team_id: teamId, athlete_id: athleteId }, { onConflict: 'team_id,athlete_id' })
    },
    [ensureMembership, supabase],
  )

  const assignCoachToTeam = useCallback(
    async (coachId: string, teamId: string) => {
      await ensureMembership(coachId, 'coach')
      await supabase.from('org_teams').update({ coach_id: coachId }).eq('id', teamId)
    },
    [ensureMembership, supabase],
  )

  const inviteTeamMembers = useCallback(
    async (teamId: string) => {
      const coachEmail = teamCoachEmail.trim()
      if (coachEmail) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', coachEmail)
          .maybeSingle()
        const profileRow = (profile || null) as { id?: string | null } | null
        if (profileRow?.id) {
          await assignCoachToTeam(profileRow.id, teamId)
        } else {
          await inviteEmail(coachEmail, 'coach', teamId)
        }
      }
      const athleteList = teamAthleteEmails
        .split(/[ ,\\n]+/)
        .map((email) => email.trim())
        .filter(Boolean)
      for (const email of athleteList) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle()
        const profileRow = (profile || null) as { id?: string | null } | null
        if (profileRow?.id) {
          await addAthleteToTeam(profileRow.id, teamId)
        } else {
          await inviteEmail(email, 'athlete', teamId)
        }
      }
    },
    [addAthleteToTeam, assignCoachToTeam, inviteEmail, supabase, teamAthleteEmails, teamCoachEmail],
  )

  const handleCreateTeam = useCallback(async () => {
    if (!orgId || !newTeamName.trim()) {
      setCreateTeamNotice('Enter a team name.')
      return
    }
    setCreateTeamSaving(true)
    setCreateTeamNotice('')
    const { data, error } = await supabase
      .from('org_teams')
      .insert({
        org_id: orgId,
        name: newTeamName.trim(),
        sport: teamSport.trim() || null,
        age_range: teamAgeRange.trim() || null,
        grade_level: teamGrade.trim() || null,
        level: teamLevel.trim() || null,
        notes: teamNotes.trim() || null,
      })
      .select('id')
      .single()
    const createdTeam = (data || null) as { id?: string | null } | null
    if (error || !createdTeam?.id) {
      setCreateTeamNotice('Unable to create team.')
      setCreateTeamSaving(false)
      return
    }
    await inviteTeamMembers(createdTeam.id)
    setCreateTeamNotice('Team created.')
    setNewTeamName('')
    setTeamSport('')
    setTeamAgeRange('')
    setTeamGrade('')
    setTeamLevel('')
    setTeamNotes('')
    setTeamCoachEmail('')
    setTeamAthleteEmails('')
    setCreateTeamSaving(false)
    setShowCreateTeamModal(false)
    await loadTeams()
  }, [
    orgId,
    newTeamName,
    supabase,
    loadTeams,
    teamSport,
    teamAgeRange,
    teamGrade,
    teamLevel,
    teamNotes,
    inviteTeamMembers,
  ])

  const handleAddAthlete = useCallback(async () => {
    if (!orgId || !activeTeam?.id || !athleteEmail.trim()) {
      setRosterNotice('Enter an athlete email.')
      return
    }
    setRosterSaving(true)
    setRosterNotice('')
    const trimmedEmail = athleteEmail.trim()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', trimmedEmail)
      .maybeSingle()
    const athleteId = profile?.id
    if (!athleteId) {
      setRosterNotice('Athlete not found. Send them an invite instead.')
      setRosterSaving(false)
      return
    }

    const { data: existingMembership } = await supabase
      .from('organization_memberships')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', athleteId)
      .maybeSingle()

    if (!existingMembership) {
      const { error: membershipError } = await supabase
        .from('organization_memberships')
        .insert({
          org_id: orgId,
          user_id: athleteId,
          role: 'athlete',
        })
      if (membershipError) {
        setRosterNotice('Unable to add athlete to organization.')
        setRosterSaving(false)
        return
      }
    }

    const alreadyOnTeam = teamMembers.some(
      (member) => member.team_id === activeTeam.id && member.athlete_id === athleteId
    )
    if (!alreadyOnTeam) {
      const { error: addError } = await supabase
        .from('org_team_members')
        .insert({
          team_id: activeTeam.id,
          athlete_id: athleteId,
        })
      if (addError) {
        setRosterNotice('Unable to add athlete to team.')
        setRosterSaving(false)
        return
      }
    }

    setRosterNotice('Athlete added.')
    setAthleteEmail('')
    setRosterSaving(false)
    setActiveTeam(null)
    await loadTeams()
  }, [activeTeam, athleteEmail, loadTeams, orgId, supabase, teamMembers])

  const handleRemoveAthlete = async (teamId: string, athleteId: string) => {
    setRemovingMemberId(athleteId)
    const { error } = await supabase
      .from('org_team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('athlete_id', athleteId)
    if (error) {
      setRosterNotice('Unable to remove athlete from team.')
    } else {
      setRosterNotice('Athlete removed from team.')
      await loadTeams()
    }
    setRemovingMemberId(null)
  }

  const isSectionVisible = useCallback(
    (athleteId: string, section: string) => {
      const value = visibilityByAthlete?.[athleteId]?.[section] || 'public'
      return value === 'public' || value === 'org'
    },
    [visibilityByAthlete]
  )

  const parseEmails = (raw: string) => {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(',')[0].trim().replace(/\"/g, ''))
      .filter((value) => value.includes('@'))
  }

  const handleImport = async () => {
    if (!orgId) {
      setImportNotice('No organization found.')
      return
    }
    if (!importTeamId) {
      setImportNotice('Select a team to import into.')
      return
    }
    const emails = parseEmails(importText)
    if (emails.length === 0) {
      setImportNotice('Paste a CSV with athlete emails.')
      return
    }
    setImportSaving(true)
    setImportNotice('')

    const { data: profilesByEmail } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('email', emails)

    const found = (profilesByEmail || []) as ProfileRow[]
    const foundIds = new Set(found.map((row) => row.id))
    const missing = emails.filter((email) => !found.some((row) => row.email === email))

    for (const athlete of found) {
      const { data: existingMembership } = await supabase
        .from('organization_memberships')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', athlete.id)
        .maybeSingle()

      if (!existingMembership) {
        await supabase
          .from('organization_memberships')
          .insert({
            org_id: orgId,
            user_id: athlete.id,
            role: 'athlete',
          })
      }

      const { data: existingTeam } = await supabase
        .from('org_team_members')
        .select('id')
        .eq('team_id', importTeamId)
        .eq('athlete_id', athlete.id)
        .maybeSingle()

      if (!existingTeam) {
        await supabase
          .from('org_team_members')
          .insert({
            team_id: importTeamId,
            athlete_id: athlete.id,
          })
      }
    }

    setImportNotice(missing.length > 0 ? `Imported ${foundIds.size} athletes. Missing: ${missing.join(', ')}` : `Imported ${foundIds.size} athletes.`)
    setImportSaving(false)
    setShowImport(false)
    setImportText('')
    setImportTeamId('')
    await loadTeams()
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">{orgConfig.portal.teamsLabel}</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Group athletes into {orgConfig.portal.teamsLabel.toLowerCase()} and manage rosters.
            </p>
            {!planActive ? (
              <p className="mt-2 text-xs text-[#4a4a4a]">
                Billing status: {statusLabel}. Activate billing to create {orgConfig.portal.teamsLabel.toLowerCase()}.
              </p>
            ) : !ORG_FEATURES[orgTier].teamCreation ? (
              <p className="mt-2 text-xs text-[#4a4a4a]">
                Team creation is available on Growth or Enterprise. Current plan: {tierLabel}.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link
              href="/org/settings#export-center"
              className="self-start rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
            <button
              className="self-start rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
              onClick={() => {
                if (!teamCreationEnabled) {
                  setNotice(`Activate billing or upgrade to create ${orgConfig.portal.teamsLabel.toLowerCase()}.`)
                  return
                }
                setShowImport(true)
                setImportNotice('')
              }}
              disabled={!teamCreationEnabled}
            >
              Import CSV
            </button>
            <button
              className="self-start rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={!teamCreationEnabled}
              onClick={() => setShowCreateTeamModal(true)}
            >
              Create {singularTeamLabel.toLowerCase()}
            </button>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-6">
            {loading ? (
              <LoadingState label={`Loading ${orgConfig.portal.teamsLabel.toLowerCase()}...`} />
            ) : notice ? (
              <EmptyState title="Unable to load teams." description={notice} />
            ) : teams.length === 0 ? (
              <EmptyState
                title={`No ${orgConfig.portal.teamsLabel.toLowerCase()} yet.`}
                description={`Create a ${singularTeamLabel.toLowerCase()} to get started.`}
              />
            ) : (
              <div className="space-y-6">
                {teams.map((team) => {
                  const coachProfile = team.coach_id ? profiles[team.coach_id] : null
                  const roster = teamMembers.filter((member) => member.team_id === team.id)
                  return (
                    <div
                      key={team.id || team.name}
                      className="glass-card cursor-pointer border border-[#191919] bg-white p-6 transition hover:border-[#191919] hover:shadow-sm"
                      onClick={() => setDetailTeam(team)}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <button
                            type="button"
                            onClick={() => setDetailTeam(team)}
                            className="text-sm font-semibold text-[#191919] underline decoration-[#191919]/30 decoration-2 underline-offset-4 hover:decoration-[#191919]"
                          >
                            {team.name || `${orgName} Team`}
                          </button>
                          <p className="mt-1 text-xs text-[#4a4a4a]">
                            Coach: {coachProfile?.full_name || 'Unassigned'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]"
                            onClick={(event) => {
                              event.stopPropagation()
                              setActiveTeam(team)
                              setRosterNotice('')
                              setAthleteEmail('')
                            }}
                          >
                            Add athlete
                          </button>
                          <button
                            className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]"
                            onClick={(event) => {
                              event.stopPropagation()
                              setInviteTeamId(team.id as string)
                              setInviteAthleteEmail('')
                              setInviteNotice('')
                            }}
                          >
                            Invite athlete
                          </button>
                          <button
                            className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]"
                            onClick={(event) => {
                              event.stopPropagation()
                              setDetailTeam(team)
                            }}
                          >
                            View team
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {roster.length === 0 ? (
                          <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
                            No athletes assigned yet.
                          </div>
                        ) : (
                          roster.map((member) => {
                            const athlete = member.athlete_id ? profiles[member.athlete_id] : null
                            if (!athlete) return null
                            const athleteMetrics = metricsByAthlete[member.athlete_id as string] || []
                            const athleteResults = resultsByAthlete[member.athlete_id as string] || []
                            const athleteMedia = mediaByAthlete[member.athlete_id as string] || []
                            return (
                              <button
                                key={member.athlete_id}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setProfileReturnTeam(null)
                                  setProfileAthlete(athlete)
                                  setProfileTeamId(team.id as string)
                                }}
                                className="flex w-full flex-col rounded-2xl border border-[#dcdcdc] bg-white/80 p-3 text-left text-xs text-[#4a4a4a] transition hover:border-[#191919] hover:bg-white"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold text-[#191919]">{athlete.full_name || 'Athlete'}</p>
                                    <p>{athlete.email || 'Email not listed'}</p>
                                  </div>
                                  <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[#4a4a4a]">
                                    View
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                  <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">
                                    {athlete.athlete_season ? `Season: ${athlete.athlete_season}` : 'Season: N/A'}
                                  </span>
                                  <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">
                                    {athlete.athlete_grade_level ? `${gradeDisplayLabel}: ${athlete.athlete_grade_level}` : `${gradeDisplayLabel}: N/A`}
                                  </span>
                                  {isSectionVisible(member.athlete_id as string, 'metrics') ? (
                                    <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">
                                      Metrics: {athleteMetrics.length}
                                    </span>
                                  ) : null}
                                  {isSectionVisible(member.athlete_id as string, 'results') ? (
                                    <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">
                                      Results: {athleteResults.length}
                                    </span>
                                  ) : null}
                                  {isSectionVisible(member.athlete_id as string, 'media') ? (
                                    <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">
                                      Media: {athleteMedia.length}
                                    </span>
                                  ) : null}
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>

                      <div className="mt-6">
                        <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Practice plans</p>
                        <div className="mt-3 grid gap-2 text-sm">
                          {practicePlans.filter((plan) => plan.team_id === team.id).slice(0, 3).length === 0 ? (
                            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                              No team plans yet.
                            </div>
                          ) : (
                            practicePlans
                              .filter((plan) => plan.team_id === team.id)
                              .slice(0, 3)
                              .map((plan) => (
                                <a
                                  key={plan.id}
                                  href={`/org/plans/${plan.id}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className="block w-full rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left text-sm text-[#191919] transition hover:border-[#191919] hover:bg-white"
                                >
                                  <p className="font-semibold text-[#191919]">{plan.title}</p>
                                  <p className="text-xs leading-relaxed text-[#4a4a4a]">
                                    {plan.session_date ? new Date(plan.session_date).toLocaleDateString() : 'No date'} ·{' '}
                                    {plan.duration_minutes ? `${plan.duration_minutes} min` : 'Open'}
                                  </p>
                                </a>
                              ))
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {detailTeam && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-[#191919] bg-white text-sm text-[#191919] shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ececec] px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Team detail</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {detailTeam.name || `${orgName} Team`}
                </h2>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  Coach: {detailTeam.coach_id ? profiles[detailTeam.coach_id]?.full_name || 'Unassigned' : 'Unassigned'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailTeam(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto px-6 py-5">
              <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Roster</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {teamMembers.filter((member) => member.team_id === detailTeam.id).length === 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
                        No athletes assigned yet.
                      </div>
                    ) : (
                      teamMembers
                        .filter((member) => member.team_id === detailTeam.id)
                        .map((member) => {
                          const athlete = member.athlete_id ? profiles[member.athlete_id] : null
                          if (!athlete) return null
                          const athleteMetrics = metricsByAthlete[member.athlete_id as string] || []
                          const athleteResults = resultsByAthlete[member.athlete_id as string] || []
                          return (
                            <button
                              key={member.athlete_id}
                              type="button"
                              onClick={() => {
                                setProfileReturnTeam(detailTeam)
                                setDetailTeam(null)
                                setProfileAthlete(athlete)
                                setProfileTeamId(detailTeam.id as string)
                              }}
                              className="flex w-full flex-col rounded-2xl border border-[#dcdcdc] bg-white/80 p-3 text-left text-xs text-[#4a4a4a] transition hover:border-[#191919] hover:bg-white"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-[#191919]">{athlete.full_name || 'Athlete'}</p>
                                  <p>{athlete.email || 'Email not listed'}</p>
                                </div>
                                <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[#4a4a4a]">
                                  View
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">
                                  {athlete.athlete_season ? `Season: ${athlete.athlete_season}` : 'Season: N/A'}
                                </span>
                                {isSectionVisible(member.athlete_id as string, 'metrics') ? (
                                  <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">
                                    Metrics: {athleteMetrics.length}
                                  </span>
                                ) : null}
                                {isSectionVisible(member.athlete_id as string, 'results') ? (
                                  <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">
                                    Results: {athleteResults.length}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          )
                        })
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Team snapshot</p>
                    <p className="mt-2 text-sm font-semibold text-[#191919]">
                      {detailTeam.name || `${orgName} Team`}
                    </p>
                    <p className="mt-1">Roster size: {teamMembers.filter((member) => member.team_id === detailTeam.id).length}</p>
                    <p className="mt-1">
                      Coach: {detailTeam.coach_id ? profiles[detailTeam.coach_id]?.full_name || 'Unassigned' : 'Unassigned'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Upcoming plans</p>
                    <div className="mt-2 space-y-2">
                      {practicePlans.filter((plan) => plan.team_id === detailTeam.id).slice(0, 3).length === 0 ? (
                        <p>No team plans yet.</p>
                      ) : (
                        practicePlans
                          .filter((plan) => plan.team_id === detailTeam.id)
                          .slice(0, 3)
                          .map((plan) => (
                            <div key={plan.id} className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2">
                              <p className="text-xs font-semibold text-[#191919]">{plan.title}</p>
                              <p className="text-[11px] text-[#4a4a4a]">
                                {plan.session_date ? new Date(plan.session_date).toLocaleDateString() : 'No date'} ·{' '}
                                {plan.duration_minutes ? `${plan.duration_minutes} min` : 'Open'}
                              </p>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {profileAthlete && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athlete profile</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {profileAthlete.full_name || 'Athlete'}
                </h2>
                <p className="mt-1 text-xs text-[#4a4a4a]">{profileAthlete.email || 'Email not listed'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (profileReturnTeam) {
                    setDetailTeam(profileReturnTeam)
                  }
                  setProfileReturnTeam(null)
                  setProfileAthlete(null)
                  setProfileTeamId(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-[#4a4a4a]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Basics</p>
                <p className="mt-2">
                  {profileAthlete.athlete_season ? `Season: ${profileAthlete.athlete_season}` : 'Season: Not listed'}
                </p>
                <p>
                  {profileAthlete.athlete_grade_level
                    ? `${gradeDisplayLabel}: ${profileAthlete.athlete_grade_level}`
                    : `${gradeDisplayLabel}: Not listed`}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Parent contact</p>
                <p className="mt-2">{profileAthlete.guardian_name || 'Parent/guardian not listed'}</p>
                <p>{profileAthlete.guardian_email || 'Email not listed'}</p>
                <p>{profileAthlete.guardian_phone || 'Phone not listed'}</p>
              </div>
              {isSectionVisible(profileAthlete.id, 'metrics') && metricsByAthlete[profileAthlete.id]?.length ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Performance metrics</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {metricsByAthlete[profileAthlete.id].slice(0, 4).map((metric) => (
                      <span key={`${metric.label}-${metric.value}`} className="rounded-full border border-[#191919] px-2 py-0.5 text-[11px] font-semibold text-[#191919]">
                        {metric.label}: {metric.value}{metric.unit ? ` ${metric.unit}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {isSectionVisible(profileAthlete.id, 'results') && resultsByAthlete[profileAthlete.id]?.length ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Latest results</p>
                  <div className="mt-2 space-y-2">
                    {resultsByAthlete[profileAthlete.id].slice(0, 2).map((result) => (
                      <div key={`${result.title}-${result.event_date}`} className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2">
                        <p className="text-xs font-semibold text-[#191919]">{result.title}</p>
                        <p className="text-[11px] text-[#4a4a4a]">
                          {result.event_date ? new Date(result.event_date).toLocaleDateString() : 'Date TBD'}
                          {result.placement ? ` · ${result.placement}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {isSectionVisible(profileAthlete.id, 'media') && mediaByAthlete[profileAthlete.id]?.length ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Media</p>
                  <p className="mt-2">{mediaByAthlete[profileAthlete.id].length} media item(s) on file</p>
                </div>
              ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/athlete/profiles/${slugify(
                      (profileAthlete.full_name || profileAthlete.email || 'athlete').trim() || 'athlete',
                    )}?${new URLSearchParams({
                      ...(profileAthlete.id ? { id: profileAthlete.id } : {}),
                      name: (profileAthlete.full_name || profileAthlete.email || 'athlete').trim() || 'athlete',
                    }).toString()}`}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  >
                    View profile
                  </Link>
                {profileTeamId ? (
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                    onClick={() => handleRemoveAthlete(profileTeamId, profileAthlete.id)}
                    disabled={removingMemberId === profileAthlete.id}
                  >
                    {removingMemberId === profileAthlete.id ? 'Removing...' : 'Remove from team'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => {
                    if (profileReturnTeam) {
                      setDetailTeam(profileReturnTeam)
                    }
                    setProfileReturnTeam(null)
                    setProfileAthlete(null)
                    setProfileTeamId(null)
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTeam && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Add athlete</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{activeTeam.name || `${orgName} Team`}</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveTeam(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm text-[#191919]">
                <span className="text-xs font-semibold text-[#4a4a4a]">Athlete email</span>
                <input
                  type="email"
                  value={athleteEmail}
                  onChange={(event) => setAthleteEmail(event.target.value)}
                  placeholder="athlete@email.com"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                />
              </label>
              {rosterNotice && (
                <p className="text-xs text-[#b80f0a]">{rosterNotice}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={handleAddAthlete}
                  disabled={rosterSaving}
                >
                  {rosterSaving ? 'Adding...' : 'Add to team'}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => {
                    setAthleteEmail('')
                    setActiveTeam(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateTeamModal && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Create {singularTeamLabel}</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Add a new {singularTeamLabel.toLowerCase()}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateTeamModal(false)
                  setCreateTeamNotice('')
                  setNewTeamName('')
                  setTeamSport('')
                  setTeamAgeRange('')
                  setTeamGrade('')
                  setTeamLevel('')
                  setTeamNotes('')
                  setTeamCoachEmail('')
                  setTeamAthleteEmails('')
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
                <label className="space-y-2 text-sm text-[#191919]">
                  <span className="text-xs font-semibold text-[#4a4a4a]">{singularTeamLabel} name</span>
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(event) => setNewTeamName(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder={teamForm.namePlaceholder}
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-[#191919]">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Sport</span>
                    <input
                      type="text"
                      value={teamSport}
                      onChange={(event) => setTeamSport(event.target.value)}
                      placeholder="e.g. Track & Field"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-[#191919]">
                    <span className="text-xs font-semibold text-[#4a4a4a]">{teamForm.ageLabel}</span>
                    <input
                      type="text"
                      value={teamAgeRange}
                      onChange={(event) => setTeamAgeRange(event.target.value)}
                      placeholder={teamForm.agePlaceholder}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-2 text-sm text-[#191919]">
                    <span className="text-xs font-semibold text-[#4a4a4a]">{teamForm.gradeLabel}</span>
                    <input
                      type="text"
                      value={teamGrade}
                      onChange={(event) => setTeamGrade(event.target.value)}
                      placeholder={teamForm.gradePlaceholder}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-[#191919]">
                    <span className="text-xs font-semibold text-[#4a4a4a]">{teamForm.levelLabel}</span>
                    <select
                      value={teamLevel}
                      onChange={(event) => setTeamLevel(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    >
                      <option value="">{teamForm.levelPlaceholder}</option>
                      {levelOptions.map((option) => (
                        <option key={option} value={option.toLowerCase()}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-[#191919]">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Notes</span>
                    <input
                      type="text"
                      value={teamNotes}
                      onChange={(event) => setTeamNotes(event.target.value)}
                      placeholder="Facility, coaches, or travel bucket"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Coach email</span>
                  <input
                    type="email"
                    value={teamCoachEmail}
                    onChange={(event) => setTeamCoachEmail(event.target.value)}
                    placeholder="coach@email.com"
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Athlete emails</span>
                  <textarea
                    value={teamAthleteEmails}
                    onChange={(event) => setTeamAthleteEmails(event.target.value)}
                    placeholder="Enter multiple emails separated by commas or newlines"
                    rows={3}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  />
                  <p className="text-[11px] text-[#4a4a4a]">Existing athletes are added immediately; others receive invites.</p>
                </label>
              {createTeamNotice && <p className="text-xs text-[#4a4a4a]">{createTeamNotice}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCreateTeam}
                  disabled={createTeamSaving}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-80"
                >
                  {createTeamSaving ? 'Creating...' : `Create ${singularTeamLabel.toLowerCase()}`}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => {
                    setShowCreateTeamModal(false)
                    setNewTeamName('')
                    setCreateTeamNotice('')
                    setTeamSport('')
                    setTeamAgeRange('')
                    setTeamGrade('')
                    setTeamLevel('')
                    setTeamNotes('')
                    setTeamCoachEmail('')
                    setTeamAthleteEmails('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Bulk import</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Add athletes via CSV</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm text-[#191919]">
                <span className="text-xs font-semibold text-[#4a4a4a]">Team</span>
                <select
                  value={importTeamId}
                  onChange={(event) => setImportTeamId(event.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="">Select team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name || `${orgName} Team`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span className="text-xs font-semibold text-[#4a4a4a]">Paste CSV (email per line)</span>
                <textarea
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  rows={6}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="athlete1@email.com&#10;athlete2@email.com"
                />
              </label>
              {importNotice && <p className="text-xs text-[#4a4a4a]">{importNotice}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={handleImport}
                  disabled={importSaving}
                >
                  {importSaving ? 'Importing...' : 'Import athletes'}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => setShowImport(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {inviteTeamId && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Invite athlete</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Send a team invite</h2>
              </div>
              <button
                type="button"
                onClick={() => setInviteTeamId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm text-[#191919]">
                <span className="text-xs font-semibold text-[#4a4a4a]">Athlete email</span>
                    <input
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      value={inviteAthleteEmail}
                      onChange={(event) => setInviteAthleteEmail(event.target.value)}
                  placeholder="athlete@email.com"
                />
              </label>
              {inviteNotice && <p className="text-xs text-[#4a4a4a]">{inviteNotice}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={async () => {
                  if (!orgId || !inviteTeamId || !inviteAthleteEmail.trim()) {
                    setInviteNotice('Add an athlete email.')
                    return
                  }
                  setInviteSaving(true)
                  setInviteNotice('')
                  const response = await fetch('/api/org/invites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      org_id: orgId,
                      team_id: inviteTeamId,
                      role: 'athlete',
                      invited_email: inviteAthleteEmail.trim(),
                    }),
                  })
                  const payload = await response.json().catch(() => null)
                  if (!response.ok) {
                    setInviteNotice(payload?.error || 'Unable to send invite.')
                  } else {
                    setInviteNotice(payload?.warning || 'Invite sent.')
                    setInviteAthleteEmail('')
                  }
                  setInviteSaving(false)
                  }}
                  disabled={inviteSaving}
                >
                  {inviteSaving ? 'Sending...' : 'Send invite'}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => setInviteTeamId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
