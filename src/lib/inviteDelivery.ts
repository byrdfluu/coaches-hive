import { buildBrandedEmailHtml, sendTransactionalEmail } from '@/lib/email'

export const sendGuardianInviteEmail = async (params: {
  toEmail: string
  athleteName: string
  inviteToken: string
}) => {
  const athleteName = (params.athleteName || 'Athlete').trim() || 'Athlete'
  const inviteToken = String(params.inviteToken || '').trim()
  const actionUrl = toAbsoluteUrl(`/guardian/accept-invite?token=${encodeURIComponent(inviteToken)}`)
  const bodyHtml = `
    <p><strong>${escapeHtml(athleteName)}</strong> listed you as the guardian for their account on Coaches Hive.</p>
    <p>Create your guardian account to review approvals, manage family settings, and stay connected to your athlete.</p>
    <p>This invite expires in 7 days.</p>
  `
  const textBody = `${athleteName} listed you as the guardian for their account on Coaches Hive. Create your guardian account here: ${actionUrl}\n\nThis invite expires in 7 days.`

  return sendTransactionalEmail({
    toEmail: params.toEmail,
    subject: `You've been listed as a guardian on Coaches Hive`,
    htmlBody: buildBrandedEmailHtml(bodyHtml, actionUrl, 'Create guardian account'),
    textBody,
    tag: 'guardian_invite',
    metadata: {
      invite_type: 'guardian',
      invite_source: 'athlete_settings',
      athlete_name: athleteName,
      action_url: actionUrl,
    },
  })
}

type GenericInviteType = 'coach' | 'athlete' | 'guardian'
const GENERIC_INVITE_TEMPLATE_ALIAS = 'user_invite'

const resolveBaseUrl = () => {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || null
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://coacheshive.com'
}

const toAbsoluteUrl = (value?: string | null) => {
  if (!value) return resolveBaseUrl()
  if (/^https?:\/\//i.test(value)) return value
  const path = value.startsWith('/') ? value : `/${value}`
  return `${resolveBaseUrl()}${path}`
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const roleLabel = (role?: string | null) => {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'assistant_coach') return 'Assistant coach'
  if (normalized === 'team_manager') return 'Team manager'
  if (normalized === 'org_admin') return 'Org admin'
  if (normalized === 'athletic_director') return 'Athletic director'
  if (normalized === 'program_director') return 'Program director'
  if (normalized === 'club_admin') return 'Club admin'
  if (normalized === 'travel_admin') return 'Travel admin'
  if (normalized === 'school_admin') return 'School admin'
  if (!normalized) return 'Member'
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const inviteLabel = (inviteType: GenericInviteType) => {
  if (inviteType === 'coach') return 'coach'
  if (inviteType === 'athlete') return 'athlete'
  return 'guardian'
}

export const sendUserInviteEmail = async (params: {
  toEmail: string
  inviteType: GenericInviteType
  inviterName?: string | null
  inviterRole?: string | null
  athleteName?: string | null
  inviteToken?: string | null
  inviteSource?: string | null
}) => {
  const inviterName = (params.inviterName || 'A Coaches Hive member').trim() || 'A Coaches Hive member'
  const inviterRole = roleLabel(params.inviterRole || 'member')
  const inviteTypeLabel = inviteLabel(params.inviteType)
  const athleteName = (params.athleteName || '').trim()
  const hasLinkedGuardianInvite = params.inviteType === 'guardian' && Boolean(params.inviteToken && athleteName)
  const actionUrl =
    hasLinkedGuardianInvite
      ? toAbsoluteUrl(`/guardian/accept-invite?token=${encodeURIComponent(String(params.inviteToken || ''))}`)
      : toAbsoluteUrl(`/signup?role=${encodeURIComponent(params.inviteType)}&email=${encodeURIComponent(params.toEmail)}`)
  const ctaLabel =
    params.inviteType === 'guardian'
      ? hasLinkedGuardianInvite
        ? 'Create guardian account'
        : 'Join as guardian'
      : `Join as ${inviteTypeLabel}`
  const emailHeading = params.inviteType === 'guardian' ? 'Guardian invite' : 'You were invited to Coaches Hive'
  const messagePreview =
    params.inviteType === 'guardian'
      ? hasLinkedGuardianInvite
        ? `${inviterName} listed you as the guardian for ${athleteName} on Coaches Hive.`
        : `${inviterName} (${inviterRole}) invited you to join Coaches Hive as a guardian.`
      : `${inviterName} (${inviterRole}) invited you to join Coaches Hive as a ${inviteTypeLabel}.`
  const bodyHtml =
    params.inviteType === 'guardian'
      ? hasLinkedGuardianInvite
        ? `
          <p><strong>${escapeHtml(inviterName)}</strong> listed you as the guardian for <strong>${escapeHtml(athleteName)}</strong> on Coaches Hive.</p>
          <p>Create your guardian account to review and approve activity for your athlete.</p>
          <p>This invite expires in 7 days.</p>
        `
        : `
          <p><strong>${escapeHtml(inviterName)}</strong> (${escapeHtml(inviterRole)}) invited you to join Coaches Hive as a <strong>guardian</strong>.</p>
          <p>Create your guardian account to manage approvals and stay connected.</p>
        `
      : `
        <p><strong>${escapeHtml(inviterName)}</strong> (${escapeHtml(inviterRole)}) invited you to join Coaches Hive as a <strong>${escapeHtml(inviteTypeLabel)}</strong>.</p>
        <p>Create your account to connect and get started.</p>
      `

  const textBody =
    params.inviteType === 'guardian'
      ? hasLinkedGuardianInvite
        ? `${inviterName} listed you as the guardian for ${athleteName} on Coaches Hive. Create your guardian account here: ${actionUrl}\n\nThis invite expires in 7 days.`
        : `${inviterName} (${inviterRole}) invited you to join Coaches Hive as a guardian. Create your account here: ${actionUrl}`
      : `${inviterName} (${inviterRole}) invited you to join Coaches Hive as a ${inviteTypeLabel}. Create your account here: ${actionUrl}`

  const metadata = {
    invite_type: params.inviteType,
    invite_source: params.inviteSource || 'generic_modal',
    inviter_name: inviterName,
    inviter_role: inviterRole,
    athlete_name: params.inviteType === 'guardian' ? athleteName : undefined,
    action_url: actionUrl,
  }

  const templateResult = await sendTransactionalEmail({
    toEmail: params.toEmail,
    subject:
      params.inviteType === 'guardian'
        ? `You've been listed as a guardian on Coaches Hive`
        : `${inviterName} invited you to join Coaches Hive`,
    templateAlias: GENERIC_INVITE_TEMPLATE_ALIAS,
    templateModel: {
      email_heading: emailHeading,
      message_preview: messagePreview,
      cta_label: ctaLabel,
      action_url: actionUrl,
      invite_type: params.inviteType,
      inviter_name: inviterName,
      inviter_role: inviterRole,
      athlete_name: params.inviteType === 'guardian' ? athleteName : '',
      invite_type_label: inviteTypeLabel,
      body_html: bodyHtml,
    },
    tag: 'user_invite',
      metadata,
  })

  if (templateResult.status === 'sent' || templateResult.status === 'skipped') {
    return templateResult
  }

  return sendTransactionalEmail({
    toEmail: params.toEmail,
    subject:
      params.inviteType === 'guardian'
        ? `You've been listed as a guardian on Coaches Hive`
        : `${inviterName} invited you to join Coaches Hive`,
    htmlBody: buildBrandedEmailHtml(bodyHtml, actionUrl, ctaLabel),
    textBody,
    tag: 'user_invite',
    metadata,
  })
}

export const getInviteDashboardPath = (role?: string | null) => {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'coach' || normalized === 'assistant_coach') return '/coach/dashboard'
  if (normalized === 'athlete') return '/athlete/dashboard'
  return '/org/permissions'
}

export const sendCoachDiscoveryInviteEmail = async (params: {
  toEmail: string
  inviterName?: string | null
  inviterRole?: string | null
  inviteSource?: string
}) => {
  return sendUserInviteEmail({
    toEmail: params.toEmail,
    inviteType: 'coach',
    inviterName: params.inviterName,
    inviterRole: params.inviterRole,
    inviteSource: params.inviteSource || 'athlete_discover',
  })
}

export const sendOrgInviteEmail = async (params: {
  toEmail: string
  inviteId: string
  orgId: string
  orgName?: string | null
  teamId?: string | null
  teamName?: string | null
  role?: string | null
  inviterName?: string | null
  isNewUser?: boolean
}) => {
  const destination = getInviteDashboardPath(params.role)
  const normalized = String(params.role || '').trim().toLowerCase()
  const roleForSignup = normalized === 'coach' || normalized === 'assistant_coach' ? 'coach' : 'athlete'
  const actionUrl = params.isNewUser
    ? toAbsoluteUrl(`/signup?role=${roleForSignup}&email=${encodeURIComponent(params.toEmail)}`)
    : toAbsoluteUrl('/login')
  const dashboardUrl = toAbsoluteUrl(destination)
  const normalizedOrgName = (params.orgName || 'your organization').trim() || 'your organization'
  const normalizedTeamName = (params.teamName || '').trim()
  const normalizedInviter = (params.inviterName || 'An organization admin').trim() || 'An organization admin'
  const normalizedRole = roleLabel(params.role)
  const teamLine = normalizedTeamName ? `Team: ${normalizedTeamName}` : null

  return sendTransactionalEmail({
    toEmail: params.toEmail,
    subject: `You were invited to ${normalizedOrgName} on Coaches Hive`,
    htmlBody: buildBrandedEmailHtml(
      `<p><strong>${escapeHtml(normalizedInviter)}</strong> invited you to join <strong>${escapeHtml(normalizedOrgName)}</strong> on Coaches Hive.</p>
       <p style="margin:4px 0;">Role: <strong>${escapeHtml(normalizedRole)}</strong></p>
       ${teamLine ? `<p style="margin:4px 0;">${escapeHtml(teamLine)}</p>` : ''}
       <p style="margin:12px 0 0;color:#4a4a4a;">Sign in with this email to accept the invite and continue setup.</p>`,
      actionUrl,
      'Open Coaches Hive →',
    ),
    textBody: `You were invited to ${normalizedOrgName} on Coaches Hive by ${normalizedInviter}. Role: ${normalizedRole}${teamLine ? `; ${teamLine}` : ''}. Sign in with this email to accept the invite: ${actionUrl}`,
    tag: 'org_invite',
    metadata: {
      invite_id: params.inviteId,
      invite_type: 'org',
      org_id: params.orgId,
      org_name: normalizedOrgName,
      team_id: params.teamId || null,
      team_name: normalizedTeamName || null,
      role: String(params.role || ''),
      inviter_name: normalizedInviter,
      action_url: actionUrl,
      dashboard_url: dashboardUrl,
    },
  })
}
