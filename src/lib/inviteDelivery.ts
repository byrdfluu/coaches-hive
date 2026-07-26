import { buildBrandedEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { resolveBaseUrl, toAbsoluteUrl } from '@/lib/siteUrl'

const GENERIC_INVITE_TEMPLATE_ALIAS = 'user_invite'
const isMissingTemplateAliasError = (message?: string | null) =>
  /template.*alias.*not valid|template.*not found|unknown template|invalid template/i.test(String(message || ''))

const sendInviteEmailWithFallback = async (params: {
  toEmail: string
  subject: string
  templateModel: Record<string, unknown>
  actionUrl: string
  ctaLabel: string
  bodyHtml: string
  textBody: string
  tag: string
  metadata?: Record<string, unknown>
}) => {
  const templateResult = await sendTransactionalEmail({
    toEmail: params.toEmail,
    subject: params.subject,
    templateAlias: GENERIC_INVITE_TEMPLATE_ALIAS,
    templateModel: params.templateModel,
    tag: params.tag,
    metadata: params.metadata,
  })

  if (templateResult.status === 'sent' || templateResult.status === 'skipped') {
    return templateResult
  }

  if (!isMissingTemplateAliasError(templateResult.error || templateResult.reason)) {
    return templateResult
  }

  return sendTransactionalEmail({
    toEmail: params.toEmail,
    subject: params.subject,
    htmlBody: buildBrandedEmailHtml(params.bodyHtml, params.actionUrl, params.ctaLabel),
    textBody: params.textBody,
    tag: params.tag,
    metadata: params.metadata,
  })
}

type GenericInviteType = 'coach' | 'athlete'

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
  return 'athlete'
}

export const sendUserInviteEmail = async (params: {
  toEmail: string
  inviteType: GenericInviteType
  inviterName?: string | null
  inviterRole?: string | null
  inviteSource?: string | null
}) => {
  const inviterName = (params.inviterName || 'A Coaches Hive member').trim() || 'A Coaches Hive member'
  const inviterRole = roleLabel(params.inviterRole || 'member')
  const inviteTypeLabel = inviteLabel(params.inviteType)
  const actionUrl = toAbsoluteUrl(`/signup?role=${encodeURIComponent(params.inviteType)}&email=${encodeURIComponent(params.toEmail)}`)
  const ctaLabel = `Join as ${inviteTypeLabel}`
  const emailHeading = 'You were invited to Coaches Hive'
  const messagePreview = `${inviterName} (${inviterRole}) invited you to join Coaches Hive as a ${inviteTypeLabel}.`
  const bodyHtml = `
    <p><strong>${escapeHtml(inviterName)}</strong> (${escapeHtml(inviterRole)}) invited you to join Coaches Hive as a <strong>${escapeHtml(inviteTypeLabel)}</strong>.</p>
    <p>Create your account to connect and get started.</p>
  `
  const textBody = `${inviterName} (${inviterRole}) invited you to join Coaches Hive as a ${inviteTypeLabel}. Create your account here: ${actionUrl}`

  const metadata = {
    invite_type: params.inviteType,
    invite_source: params.inviteSource || 'generic_modal',
    inviter_name: inviterName,
    inviter_role: inviterRole,
    action_url: actionUrl,
  }

  return sendInviteEmailWithFallback({
    toEmail: params.toEmail,
    subject: `${inviterName} invited you to join Coaches Hive`,
    templateModel: {
      email_heading: emailHeading,
      message_preview: messagePreview,
      cta_label: ctaLabel,
      action_url: actionUrl,
      invite_type: params.inviteType,
      inviter_name: inviterName,
      inviter_role: inviterRole,
      athlete_name: '',
      invite_type_label: inviteTypeLabel,
      body_html: bodyHtml,
    },
    actionUrl,
    ctaLabel,
    bodyHtml,
    textBody,
    tag: 'user_invite',
    metadata,
  })
}

export const getInviteDashboardPath = (role?: string | null) => {
  void role
  return '/open-app'
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

  const bodyHtml = `
    <p><strong>${escapeHtml(normalizedInviter)}</strong> added you to <strong>${escapeHtml(normalizedOrgName)}</strong> on Coaches Hive as a <strong>${escapeHtml(normalizedRole)}</strong>.</p>
    ${teamLine ? `<p style="margin:4px 0;">${escapeHtml(teamLine)}</p>` : ''}
    <p style="margin:12px 0 0;color:#4a4a4a;">Sign in to see your team assignments and get started.</p>
  `
  const subject = `You were invited to ${normalizedOrgName} on Coaches Hive`
  const ctaLabel = 'Open Coaches Hive'
  const textBody = `${normalizedInviter} added you to ${normalizedOrgName} on Coaches Hive as a ${normalizedRole}${teamLine ? `. ${teamLine}` : ''}. Sign in to see your team assignments and get started: ${actionUrl}`

  return sendInviteEmailWithFallback({
    toEmail: params.toEmail,
    subject,
    templateModel: {
      email_heading: 'Organization invite',
      message_preview: `${normalizedInviter} invited you to join ${normalizedOrgName} on Coaches Hive.`,
      cta_label: ctaLabel,
      action_url: actionUrl,
      dashboard_url: dashboardUrl,
      invite_type: 'org',
      inviter_name: normalizedInviter,
      inviter_role: normalizedRole,
      org_name: normalizedOrgName,
      team_name: normalizedTeamName,
      invite_type_label: normalizedRole,
      body_html: bodyHtml,
    },
    actionUrl,
    ctaLabel,
    bodyHtml,
    textBody,
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
