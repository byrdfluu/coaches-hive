import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type GuardianApprovalScope = 'messages' | 'transactions'
export type GuardianApprovalTargetType = 'coach' | 'org' | 'team'

type GuardianProfileRow = {
  id: string
  email?: string | null
  full_name?: string | null
  guardian_name?: string | null
  guardian_email?: string | null
  guardian_phone?: string | null
  guardian_approval_rule?: 'required' | 'notify' | 'none' | null
  account_owner_type?: 'athlete_adult' | 'athlete_minor' | 'guardian' | null
  athlete_birthdate?: string | null
}

type GuardianApprovalRow = {
  id: string
  status: 'pending' | 'approved' | 'denied' | 'expired'
  expires_at?: string | null
  created_at?: string | null
}

export type GuardianApprovalCheck = {
  allowed: boolean
  required: boolean
  pending: boolean
  approvalId?: string | null
  profile?: GuardianProfileRow | null
}

export const GUARDIAN_SCOPE_LABEL: Record<GuardianApprovalScope, string> = {
  messages: 'messaging',
  transactions: 'booking and payments',
}

const calculateAge = (birthdate?: string | null) => {
  if (!birthdate) return null
  const date = new Date(birthdate)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const hasHadBirthday =
    now.getMonth() > date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate())
  if (!hasHadBirthday) age -= 1
  return age
}

const isApprovalActive = (approval: GuardianApprovalRow) => {
  if (!approval.expires_at) return true
  const expiresAt = new Date(approval.expires_at)
  if (Number.isNaN(expiresAt.getTime())) return true
  return expiresAt.getTime() >= Date.now()
}

export const normalizeGuardianScope = (value: unknown): GuardianApprovalScope =>
  value === 'transactions' ? 'transactions' : 'messages'

export const profileNeedsGuardianApproval = (profile?: GuardianProfileRow | null) => {
  if (!profile) return false
  if (profile.account_owner_type === 'guardian') return false
  const birthdateAge = calculateAge(profile.athlete_birthdate || null)
  return (
    profile.account_owner_type === 'athlete_minor' ||
    (birthdateAge !== null && birthdateAge < 18) ||
    profile.guardian_approval_rule === 'required'
  )
}

export const getAthleteGuardianProfile = async (athleteId: string) => {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, email, full_name, guardian_name, guardian_email, guardian_phone, guardian_approval_rule, account_owner_type, athlete_birthdate',
    )
    .eq('id', athleteId)
    .maybeSingle()

  return (data as GuardianProfileRow | null) || null
}

export const checkGuardianApproval = async (params: {
  athleteId: string
  targetType: GuardianApprovalTargetType
  targetId: string
  scope: GuardianApprovalScope
}): Promise<GuardianApprovalCheck> => {
  const profile = await getAthleteGuardianProfile(params.athleteId)
  if (!profile) {
    return { allowed: true, required: false, pending: false }
  }

  const required = profileNeedsGuardianApproval(profile)
  if (!required) {
    return { allowed: true, required: false, pending: false, profile }
  }

  const { data: approvals } = await supabaseAdmin
    .from('guardian_approvals')
    .select('id, status, expires_at, created_at')
    .eq('athlete_id', params.athleteId)
    .eq('target_type', params.targetType)
    .eq('target_id', params.targetId)
    .eq('scope', params.scope)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })

  const activeApprovals = ((approvals || []) as GuardianApprovalRow[]).filter(isApprovalActive)
  const approved = activeApprovals.find((item) => item.status === 'approved')
  if (approved) {
    return {
      allowed: true,
      required: true,
      pending: false,
      approvalId: approved.id,
      profile,
    }
  }

  const pending = activeApprovals.find((item) => item.status === 'pending')
  return {
    allowed: false,
    required: true,
    pending: Boolean(pending),
    approvalId: pending?.id || null,
    profile,
  }
}

export const guardianApprovalBlockedResponse = (params: {
  scope: GuardianApprovalScope
  targetType: GuardianApprovalTargetType
  targetId: string
  pending: boolean
  approvalId?: string | null
}) =>
  NextResponse.json(
    {
      error: params.pending
        ? 'Guardian approval request is still pending.'
        : 'Guardian approval required before this action.',
      code: params.pending ? 'guardian_approval_pending' : 'guardian_approval_required',
      approval_scope: params.scope,
      target_type: params.targetType,
      target_id: params.targetId,
      approval_id: params.approvalId || null,
    },
    { status: 403 },
  )

export const resolveGuardianUserIdForAthlete = async (
  athleteId: string,
  profile?: GuardianProfileRow | null,
) => {
  const guardianProfile = profile || (await getAthleteGuardianProfile(athleteId))
  if (!guardianProfile) return null
  const guardianEmail = String(guardianProfile.guardian_email || '').trim().toLowerCase()

  const markPendingInvitesAccepted = async (userId?: string | null) => {
    if (!guardianEmail) return
    const updatePayload: Record<string, unknown> = {
      status: 'accepted',
    }
    if (userId) {
      updatePayload.guardian_user_id = userId
    }
    const { error: inviteError } = await supabaseAdmin
      .from('guardian_invites')
      .update(updatePayload)
      .eq('athlete_id', athleteId)
      .eq('guardian_email', guardianEmail)
      .eq('status', 'pending')
    if (inviteError) {
      console.error('[guardianApproval] unable to mark guardian_invites accepted', inviteError)
    }
  }

  const { data: existingLink } = await supabaseAdmin
    .from('guardian_athlete_links')
    .select('guardian_user_id')
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (existingLink?.guardian_user_id) {
    await markPendingInvitesAccepted(String(existingLink.guardian_user_id))
    return String(existingLink.guardian_user_id)
  }

  if (!guardianEmail) return null

  const { data: linkedGuardian } = await supabaseAdmin
    .from('profiles')
    .select('id, account_owner_type')
    .eq('email', guardianEmail)
    .neq('id', athleteId)
    .maybeSingle()

  const guardianUserId = linkedGuardian?.id || null
  if (!guardianUserId) return null
  const linkedOwnerType = String(linkedGuardian?.account_owner_type || '').trim().toLowerCase()
  if (linkedOwnerType && linkedOwnerType !== 'guardian') {
    return null
  }

  const { error } = await supabaseAdmin.from('guardian_athlete_links').upsert(
    {
      guardian_user_id: guardianUserId,
      athlete_id: athleteId,
      relationship: 'parent',
      status: 'active',
      created_by: athleteId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'guardian_user_id,athlete_id' },
  )

  if (error) {
    console.error('[guardianApproval] unable to upsert guardian_athlete_links', error)
  } else {
    await markPendingInvitesAccepted(guardianUserId)
  }

  return guardianUserId
}
