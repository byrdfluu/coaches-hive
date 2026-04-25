import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { isCoachAthleteLaunch } from '@/lib/launchSurface'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'
import { sendSupportTicketReplyEmail } from '@/lib/email'
import { resolveSupportDashboardPath } from '@/lib/supportPaths'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

type VerificationEntityType = 'profile' | 'organization'

type VerificationNote = {
  last_action?: 'approved' | 'rejected' | 'needs_review' | string
  requested_docs?: string[]
  request_reason?: string | null
  rejection_reason?: string | null
  internal_note?: string | null
  updated_at?: string | null
  updated_by?: string | null
}

type VerificationOpsConfig = {
  by_user?: Record<string, VerificationNote>
}

type ProfileRow = {
  id: string
  role?: string | null
  full_name?: string | null
  email?: string | null
  verification_status?: string | null
  verification_submitted_at?: string | null
  verification_reviewed_at?: string | null
  verification_reviewed_by?: string | null
  has_id_document?: boolean | null
  has_certifications?: boolean | null
  bio?: string | null
  created_at?: string | null
  coach_profile_settings?: Record<string, unknown> | null
}

type OrganizationRow = {
  id: string
  name?: string | null
  verification_status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type OrgSettingsRow = {
  org_id: string
  org_name?: string | null
  primary_contact_email?: string | null
  portal_preferences?: Record<string, unknown> | null
  updated_at?: string | null
}

type OrgComplianceRow = {
  org_id: string
  file_name?: string | null
  file_path: string
  created_at?: string | null
}

type VerificationDocument = {
  name: string
  path: string
  category: 'gov_id' | 'certifications' | 'org_compliance'
  created_at: string | null
  signed_url: string | null
}

type VerificationQueueItem = {
  id: string
  entity_type: VerificationEntityType
  name: string
  email: string
  status: string
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  has_id_document: boolean
  has_certifications: boolean
  bio: string
  certification_name: string | null
  certification_file_url: string | null
  requested_docs: string[]
  request_reason: string | null
  rejection_reason: string | null
  internal_note: string | null
  notes_updated_at: string | null
  docs_count: number
  documents: VerificationDocument[]
}

const noteKeyForSubject = (entityType: VerificationEntityType, id: string) =>
  entityType === 'organization' ? `organization:${id}` : id

const normalizeStatus = (value: string | null | undefined) => String(value || '').trim().toLowerCase()
const OPEN_VERIFICATION_STATUSES = new Set(['pending', 'submitted', 'needs_review', 'flagged'])

const buildVerificationDocsRequestMessage = ({
  reason,
  requestedDocs,
}: {
  reason: string
  requestedDocs: string[]
}) =>
  [
    'We reviewed your verification submission and need a few more details before we can approve it.',
    reason,
    requestedDocs.length > 0 ? `Requested documents: ${requestedDocs.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

const upsertVerificationSupportTicket = async ({
  entityType,
  targetId,
  item,
  requesterRole,
  requestedDocs,
  reason,
  adminUserId,
  adminUserEmail,
}: {
  entityType: VerificationEntityType
  targetId: string
  item: VerificationQueueItem
  requesterRole?: string | null
  requestedDocs: string[]
  reason: string
  adminUserId: string
  adminUserEmail?: string | null
}) => {
  if (!item.email) return null

  const now = new Date().toISOString()
  const messageBody = buildVerificationDocsRequestMessage({ reason, requestedDocs })
  const subject =
    entityType === 'organization'
      ? 'Additional organization verification documents required'
      : 'Additional verification documents required'

  const { data: candidateTickets } = await supabaseAdmin
    .from('support_tickets')
    .select('*')
    .eq('requester_email', item.email)
    .in('status', ['open', 'pending'])
    .order('updated_at', { ascending: false })
    .limit(25)

  const matchingTicket = (candidateTickets || []).find((ticket) => {
    const metadata = (ticket.metadata || {}) as Record<string, unknown>
    return (
      String(metadata.verification_subject_type || '') === entityType
      && String(metadata.verification_subject_id || '') === targetId
    )
  }) || null

  const baseMetadata = {
    verification_subject_type: entityType,
    verification_subject_id: targetId,
    requested_docs: requestedDocs,
    verification_request_reason: reason,
    requester_id: entityType === 'profile' ? targetId : null,
  }

  let ticketId = matchingTicket?.id || null
  if (!matchingTicket) {
    const priority = 'high'
    const slaMinutes = getSlaMinutes(priority)
    const slaDueAt = getSlaDueAt(now, priority)
    const suggestedTemplate = suggestTemplateId(subject, messageBody)
    const { data: createdTicket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        subject,
        status: 'pending',
        priority,
        channel: 'in_app',
        requester_name: item.name,
        requester_email: item.email,
        requester_role: requesterRole || (entityType === 'organization' ? 'org_admin' : 'coach'),
        assigned_to: null,
        last_message_preview: messageBody.slice(0, 140),
        last_message_at: now,
        sla_minutes: slaMinutes,
        sla_due_at: slaDueAt,
        metadata: {
          suggested_template: suggestedTemplate,
          ...baseMetadata,
        },
      })
      .select('*')
      .single()

    if (ticketError || !createdTicket) {
      return null
    }
    ticketId = createdTicket.id
  } else {
    const existingMetadata = (matchingTicket.metadata || {}) as Record<string, unknown>
    await supabaseAdmin
      .from('support_tickets')
      .update({
        status: 'pending',
        last_message_preview: messageBody.slice(0, 140),
        last_message_at: now,
        updated_at: now,
        metadata: {
          ...existingMetadata,
          ...baseMetadata,
        },
      })
      .eq('id', matchingTicket.id)
    ticketId = matchingTicket.id
  }

  if (!ticketId) return null

  const { data: createdMessage } = await supabaseAdmin
    .from('support_messages')
    .insert({
      ticket_id: ticketId,
      sender_role: 'admin',
      sender_name: adminUserEmail || 'Coaches Hive support',
      sender_id: adminUserId,
      body: messageBody,
      is_internal: false,
      metadata: {
        verification_subject_type: entityType,
        verification_subject_id: targetId,
        requested_docs: requestedDocs,
      },
    })
    .select('id')
    .single()

  await sendSupportTicketReplyEmail({
    toEmail: item.email,
    toName: item.name || null,
    subject,
    replyBody: messageBody,
    ticketId,
    messageId: createdMessage?.id || null,
    dashboardUrl: resolveSupportDashboardPath(requesterRole || (entityType === 'organization' ? 'org_admin' : 'coach')),
  }).catch(() => null)

  return ticketId
}

const requireVerificationAccess = async (permission: 'read' | 'manage') => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { session: null, error: jsonError('Unauthorized', 401) }
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (!adminAccess.teamRole) {
    return { session: null, teamRole: null, canManage: false, error: jsonError('Forbidden', 403) }
  }

  const teamRole = adminAccess.teamRole
  const canManage = teamRole === 'ops' || teamRole === 'superadmin'
  const canRead = canManage || teamRole === 'support' || teamRole === 'finance'
  if (permission === 'manage' && !canManage) {
    return { session: null, teamRole: null, canManage: false, error: jsonError('Forbidden', 403) }
  }
  if (permission === 'read' && !canRead) {
    return { session: null, teamRole: null, canManage: false, error: jsonError('Forbidden', 403) }
  }

  return { session, teamRole, canManage, error: null as NextResponse | null }
}

const listDocumentsForProfile = async (userId: string) => {
  const bucket = 'verifications'
  const categories: Array<'gov_id' | 'certifications'> = ['gov_id', 'certifications']

  const perCategory = await Promise.all(
    categories.map(async (category) => {
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .list(`${userId}/${category}`, { limit: 100, sortBy: { column: 'name', order: 'desc' } })

      if (error || !data) return [] as VerificationDocument[]

      const docs = data
        .filter((item) => Boolean(item?.name) && item.name !== '.emptyFolderPlaceholder')
        .map((item) => ({
          name: item.name,
          path: `${userId}/${category}/${item.name}`,
          category: category as VerificationDocument['category'],
          created_at: item.created_at || null,
        }))

      if (docs.length === 0) return [] as VerificationDocument[]

      const paths = docs.map((doc) => doc.path)
      const { data: signedRows } = await supabaseAdmin.storage.from(bucket).createSignedUrls(paths, 60 * 30)

      const signedByPath = new Map<string, string | null>()
      ;(signedRows || []).forEach((row: { signedUrl?: string | null } | null | undefined, index: number) => {
        const path = paths[index]
        signedByPath.set(path, row?.signedUrl || null)
      })

      return docs.map((doc) => ({
        ...doc,
        signed_url: signedByPath.get(doc.path) || null,
      }))
    }),
  )

  return perCategory.flat()
}

const listDocumentsForOrganization = async (orgId: string) => {
  const { data, error } = await supabaseAdmin
    .from('org_compliance_uploads')
    .select('org_id, file_name, file_path, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error || !data || data.length === 0) return [] as VerificationDocument[]

  const rows = data as OrgComplianceRow[]
  const paths = rows.map((row) => row.file_path).filter(Boolean)

  if (!paths.length) return [] as VerificationDocument[]

  const { data: signedRows } = await supabaseAdmin.storage
    .from('attachments')
    .createSignedUrls(paths, 60 * 30)

  const signedByPath = new Map<string, string | null>()
  ;(signedRows || []).forEach((row: { signedUrl?: string | null } | null | undefined, index: number) => {
    const path = paths[index]
    signedByPath.set(path, row?.signedUrl || null)
  })

  return rows.map((row) => ({
    name: row.file_name || row.file_path.split('/').pop() || 'Document',
    path: row.file_path,
    category: 'org_compliance' as const,
    created_at: row.created_at || null,
    signed_url: signedByPath.get(row.file_path) || null,
  }))
}

export async function GET(request: Request) {
  const { error, canManage } = await requireVerificationAccess('read')
  if (error) return error

  const url = new URL(request.url)
  const pageParam = Number(url.searchParams.get('page') || '1')
  const pageSizeParam = Number(url.searchParams.get('page_size') || '25')
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.floor(pageParam)) : 1
  const pageSize = Number.isFinite(pageSizeParam)
    ? Math.min(100, Math.max(10, Math.floor(pageSizeParam)))
    : 25

  const query = String(url.searchParams.get('query') || '').trim().toLowerCase()
  const statusFilter = String(url.searchParams.get('status') || 'open').trim().toLowerCase()
  const includeDocs = String(url.searchParams.get('include_docs') || '') === '1'

  const [profilesResult, organizationsResult, orgSettingsResult] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, role, full_name, email, verification_status, verification_submitted_at, verification_reviewed_at, verification_reviewed_by, has_id_document, has_certifications, bio, created_at, coach_profile_settings')
      .in('role', ['coach', 'assistant_coach'])
      .order('created_at', { ascending: false })
      .limit(1000),
    isCoachAthleteLaunch
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin
          .from('organizations')
          .select('id, name, verification_status, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(1000),
    isCoachAthleteLaunch
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin
          .from('org_settings')
          .select('org_id, org_name, primary_contact_email, portal_preferences, updated_at')
          .limit(1000),
  ])

  if (profilesResult.error) return jsonError(profilesResult.error.message)
  if (organizationsResult.error) return jsonError(organizationsResult.error.message)
  if (orgSettingsResult.error) return jsonError(orgSettingsResult.error.message)

  const opsConfig = (await getAdminConfig<VerificationOpsConfig>('verification_ops')) || {}
  const byUser = (opsConfig.by_user || {}) as Record<string, VerificationNote>

  const settingsByOrg = new Map<string, OrgSettingsRow>()
  ;((orgSettingsResult.data || []) as OrgSettingsRow[]).forEach((row) => {
    if (row.org_id) settingsByOrg.set(row.org_id, row)
  })

  const orgIds = ((organizationsResult.data || []) as OrganizationRow[])
    .map((row) => row.id)
    .filter(Boolean)

  const orgDocCountById = new Map<string, number>()
  if (orgIds.length > 0) {
    const { data: orgDocRows, error: orgDocError } = await supabaseAdmin
      .from('org_compliance_uploads')
      .select('org_id')
      .in('org_id', orgIds)
      .limit(5000)

    if (!orgDocError && orgDocRows) {
      ;(orgDocRows as Array<{ org_id?: string | null }>).forEach((row) => {
        if (!row.org_id) return
        orgDocCountById.set(row.org_id, (orgDocCountById.get(row.org_id) || 0) + 1)
      })
    }
  }

  const profileItems = ((profilesResult.data || []) as ProfileRow[]).map((profile) => {
    const status = normalizeStatus(profile.verification_status) || 'pending'
    const settings = (profile.coach_profile_settings || {}) as Record<string, unknown>
    const certification = (settings.certification || {}) as Record<string, unknown>
    const note = byUser[noteKeyForSubject('profile', profile.id)] || byUser[profile.id] || {}

    return {
      id: profile.id,
      entity_type: 'profile' as const,
      name: profile.full_name || profile.email || 'User',
      email: profile.email || '',
      status,
      submitted_at: profile.verification_submitted_at || profile.created_at || null,
      reviewed_at: profile.verification_reviewed_at || note.updated_at || null,
      reviewed_by: profile.verification_reviewed_by || note.updated_by || null,
      has_id_document: Boolean(profile.has_id_document),
      has_certifications: Boolean(profile.has_certifications),
      bio: profile.bio || '',
      certification_name: String(certification.name || '') || null,
      certification_file_url: String(certification.fileUrl || '') || null,
      requested_docs: Array.isArray(note.requested_docs) ? note.requested_docs : [],
      request_reason: note.request_reason || null,
      rejection_reason: note.rejection_reason || null,
      internal_note: note.internal_note || null,
      notes_updated_at: note.updated_at || null,
      docs_count: 0,
      documents: [] as VerificationDocument[],
    } satisfies VerificationQueueItem
  })

  const organizationItems = ((organizationsResult.data || []) as OrganizationRow[]).map((org) => {
    const settings = settingsByOrg.get(org.id)
    const portalPreferences = (settings?.portal_preferences || {}) as Record<string, unknown>
    const publicProfile = (portalPreferences.public_profile || {}) as Record<string, unknown>
    const status = normalizeStatus(org.verification_status) || 'pending'
    const note = byUser[noteKeyForSubject('organization', org.id)] || {}

    return {
      id: org.id,
      entity_type: 'organization' as const,
      name: org.name || settings?.org_name || 'Organization',
      email: settings?.primary_contact_email || '',
      status,
      submitted_at: org.updated_at || settings?.updated_at || org.created_at || null,
      reviewed_at: note.updated_at || null,
      reviewed_by: note.updated_by || null,
      has_id_document: false,
      has_certifications: (orgDocCountById.get(org.id) || 0) > 0,
      bio: String(publicProfile.mission || ''),
      certification_name: null,
      certification_file_url: null,
      requested_docs: Array.isArray(note.requested_docs) ? note.requested_docs : [],
      request_reason: note.request_reason || null,
      rejection_reason: note.rejection_reason || null,
      internal_note: note.internal_note || null,
      notes_updated_at: note.updated_at || null,
      docs_count: orgDocCountById.get(org.id) || 0,
      documents: [] as VerificationDocument[],
    } satisfies VerificationQueueItem
  })

  const mapped = [...profileItems, ...organizationItems].sort((a, b) => {
    const aTs = new Date(a.submitted_at || a.notes_updated_at || 0).getTime() || 0
    const bTs = new Date(b.submitted_at || b.notes_updated_at || 0).getTime() || 0
    return bTs - aTs
  })

  let filtered = mapped
  if (statusFilter === 'open') {
    filtered = mapped.filter((item) => OPEN_VERIFICATION_STATUSES.has(item.status))
  } else if (statusFilter !== 'all') {
    filtered = mapped.filter((item) => item.status === statusFilter)
  }

  if (query) {
    filtered = filtered.filter((item) => {
      const haystack = [
        item.id,
        item.entity_type,
        item.name,
        item.email,
        item.status,
        item.request_reason,
        item.rejection_reason,
        item.internal_note,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
      return haystack.includes(query)
    })
  }

  const total = filtered.length
  const from = (page - 1) * pageSize
  const to = from + pageSize
  let pageRows = filtered.slice(from, to)

  if (includeDocs) {
    pageRows = await Promise.all(
      pageRows.map(async (item) => {
        const docs = item.entity_type === 'organization'
          ? await listDocumentsForOrganization(item.id)
          : await listDocumentsForProfile(item.id)
        return {
          ...item,
          documents: docs,
          docs_count: docs.length,
        }
      }),
    )
  } else {
    pageRows = pageRows.map((item) => {
      if (item.entity_type === 'organization') {
        return {
          ...item,
          documents: [],
        }
      }
      return {
        ...item,
        documents: [],
        docs_count:
          (item.has_id_document ? 1 : 0)
          + (item.has_certifications ? 1 : 0)
          + (item.certification_file_url ? 1 : 0),
      }
    })
  }

  const pendingCount = mapped.filter((item) => item.status === 'pending').length
  const flaggedCount = mapped.filter((item) => {
    return ['needs_review', 'denied', 'rejected', 'flagged'].includes(item.status)
  }).length
  const approvedCount = mapped.filter((item) => item.status === 'approved').length

  const profileCompleteCount = mapped.filter((item) => {
    const hasName = Boolean(String(item.name || '').trim())
    const hasEmail = Boolean(String(item.email || '').trim())
    const hasBio = Boolean(String(item.bio || '').trim())
    return hasName && hasEmail && hasBio
  }).length

  const certificationCount = mapped.filter((item) => {
    return item.docs_count > 0 || Boolean(String(item.certification_name || '').trim() || String(item.certification_file_url || '').trim())
  }).length

  return NextResponse.json({
    queue: pageRows,
    can_manage: canManage,
    pagination: {
      page,
      page_size: pageSize,
      total,
      has_next: to < total,
    },
    summary: {
      total,
      pending: pendingCount,
      flagged: flaggedCount,
      approved: approvedCount,
    },
    checklist: {
      government_id_matched: {
        done: approvedCount,
        total: mapped.length,
      },
      profile_completeness: {
        done: profileCompleteCount,
        total: mapped.length,
      },
      certifications_uploaded: {
        done: certificationCount,
        total: mapped.length,
      },
    },
  })
}

export async function POST(request: Request) {
  const { session, error } = await requireVerificationAccess('manage')
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '').trim().toLowerCase()
  const targetId = String(body?.user_id || '').trim()
  const entityType = (String(body?.entity_type || 'profile').trim().toLowerCase() === 'organization'
    ? 'organization'
    : 'profile') as VerificationEntityType
  const reason = String(body?.reason || '').trim()
  const internalNote = String(body?.internal_note || '').trim()
  const requestedDocsRaw = Array.isArray(body?.requested_docs)
    ? body.requested_docs
    : String(body?.requested_docs || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

  if (!targetId) return jsonError('user_id is required')
  if (!['approve', 'reject', 'request_docs'].includes(action)) {
    return jsonError('action must be approve, reject, or request_docs')
  }
  if (isCoachAthleteLaunch && entityType === 'organization') {
    return jsonError('Organization verifications are disabled in the current launch mode', 404)
  }

  if ((action === 'reject' || action === 'request_docs') && !reason) {
    return jsonError('reason is required')
  }

  const nextStatus = action === 'approve'
    ? 'approved'
    : action === 'reject'
    ? 'rejected'
    : 'needs_review'

  let item: VerificationQueueItem | null = null

  if (entityType === 'organization') {
    const { data: updatedOrg, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({
        verification_status: nextStatus,
      })
      .eq('id', targetId)
      .select('id, name, verification_status, created_at, updated_at')
      .single()

    if (updateError) return jsonError(updateError.message)

    const { data: orgSettings } = await supabaseAdmin
      .from('org_settings')
      .select('org_id, org_name, primary_contact_email, portal_preferences, updated_at')
      .eq('org_id', targetId)
      .maybeSingle()

    const docs = await listDocumentsForOrganization(targetId)
    const portalPreferences = ((orgSettings?.portal_preferences || {}) as Record<string, unknown>)
    const publicProfile = ((portalPreferences.public_profile || {}) as Record<string, unknown>)

    item = {
      id: updatedOrg.id,
      entity_type: 'organization',
      name: updatedOrg.name || orgSettings?.org_name || 'Organization',
      email: orgSettings?.primary_contact_email || '',
      status: normalizeStatus(updatedOrg.verification_status) || nextStatus,
      submitted_at: updatedOrg.updated_at || orgSettings?.updated_at || updatedOrg.created_at || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.user.id,
      has_id_document: false,
      has_certifications: docs.length > 0,
      bio: String(publicProfile.mission || ''),
      certification_name: null,
      certification_file_url: null,
      requested_docs: [],
      request_reason: null,
      rejection_reason: null,
      internal_note: null,
      notes_updated_at: null,
      docs_count: docs.length,
      documents: docs,
    }
  } else {
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        verification_status: nextStatus,
        verification_reviewed_at: new Date().toISOString(),
        verification_reviewed_by: session.user.id,
      })
      .eq('id', targetId)
      .select('id, role, full_name, email, verification_status, verification_submitted_at, verification_reviewed_at, verification_reviewed_by, has_id_document, has_certifications, bio, coach_profile_settings')
      .single()

    if (updateError) return jsonError(updateError.message)

    const profile = updatedProfile as ProfileRow
    const settings = (profile.coach_profile_settings || {}) as Record<string, unknown>
    const certification = (settings.certification || {}) as Record<string, unknown>
    const docs = await listDocumentsForProfile(targetId)

    item = {
      id: profile.id,
      entity_type: 'profile',
      name: profile.full_name || profile.email || 'User',
      email: profile.email || '',
      status: normalizeStatus(profile.verification_status) || 'pending',
      submitted_at: profile.verification_submitted_at || null,
      reviewed_at: profile.verification_reviewed_at || null,
      reviewed_by: profile.verification_reviewed_by || null,
      has_id_document: Boolean(profile.has_id_document),
      has_certifications: Boolean(profile.has_certifications),
      bio: profile.bio || '',
      certification_name: String(certification.name || '') || null,
      certification_file_url: String(certification.fileUrl || '') || null,
      requested_docs: [],
      request_reason: null,
      rejection_reason: null,
      internal_note: null,
      notes_updated_at: null,
      docs_count: docs.length,
      documents: docs,
    }
  }

  const currentConfig = (await getAdminConfig<VerificationOpsConfig>('verification_ops')) || {}
  const byUser = (currentConfig.by_user || {}) as Record<string, VerificationNote>

  const noteKey = noteKeyForSubject(entityType, targetId)
  const existingNote = byUser[noteKey] || (entityType === 'profile' ? byUser[targetId] || {} : {})

  byUser[noteKey] = {
    ...existingNote,
    last_action: nextStatus,
    requested_docs: action === 'request_docs'
      ? requestedDocsRaw
      : (existingNote.requested_docs || []),
    request_reason: action === 'request_docs'
      ? reason
      : (action === 'approve' ? null : existingNote.request_reason || null),
    rejection_reason: action === 'reject'
      ? reason
      : (action === 'approve' ? null : existingNote.rejection_reason || null),
    internal_note: internalNote || existingNote.internal_note || null,
    updated_at: new Date().toISOString(),
    updated_by: session.user.id,
  }

  await setAdminConfig('verification_ops', {
    by_user: byUser,
  })

  if (action === 'request_docs' && item) {
    await upsertVerificationSupportTicket({
      entityType,
      targetId,
      item,
      requesterRole: entityType === 'organization' ? 'org_admin' : 'coach',
      requestedDocs: requestedDocsRaw,
      reason,
      adminUserId: session.user.id,
      adminUserEmail: session.user.email || null,
    })
  }

  await logAdminAction({
    action: `admin.verifications.${entityType}.${action}`,
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: entityType === 'organization' ? 'organization' : 'profile',
    targetId,
    metadata: {
      entity_type: entityType,
      status: nextStatus,
      reason: reason || null,
      requested_docs: requestedDocsRaw,
      internal_note: internalNote || null,
    },
  })

  if (!item) return jsonError('Unable to update verification', 500)

  const savedNote = byUser[noteKey] || {}

  return NextResponse.json({
    ok: true,
    item: {
      ...item,
      requested_docs: savedNote.requested_docs || [],
      request_reason: savedNote.request_reason || null,
      rejection_reason: savedNote.rejection_reason || null,
      internal_note: savedNote.internal_note || null,
      notes_updated_at: savedNote.updated_at || null,
      reviewed_at: item.reviewed_at || savedNote.updated_at || null,
      reviewed_by: item.reviewed_by || savedNote.updated_by || null,
    },
  })
}
