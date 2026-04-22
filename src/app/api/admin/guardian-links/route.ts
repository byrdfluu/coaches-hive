import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import type { Session } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { resolveAdminAccess } from '@/lib/adminRoles'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async (): Promise<
  | { response: NextResponse; session: null }
  | { response: null; session: Session }
> => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { response: jsonError('Unauthorized', 401), session: null }
  }

  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return { response: jsonError('Forbidden', 403), session: null }
  }

  return { response: null, session }
}

type GuardianLinkRow = {
  id: string
  guardian_user_id: string | null
  athlete_id: string
  relationship: string | null
  status: string
  created_at: string
  updated_at: string
  source?: 'link' | 'invite'
  invite_expires_at?: string | null
}

const toMap = <T extends { id: string }>(rows: T[] = []) =>
  rows.reduce<Record<string, T>>((acc, row) => {
    acc[row.id] = row
    return acc
  }, {})

const listAllAuthUsers = async () => {
  const users: Array<any> = []

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) {
      return { users: [], error }
    }

    const pageUsers = data.users || []
    users.push(...pageUsers)
    if (pageUsers.length < 200) break
  }

  return { users, error: null as any }
}

const getEmailVerificationStatus = (user: { email_confirmed_at?: string | null; confirmed_at?: string | null } | null | undefined) =>
  user?.email_confirmed_at || user?.confirmed_at ? 'Email verified' : 'Email verification pending'

const loadGuardianLinksDataset = async (statusFilter: string, query: string, limit: number) => {
  let queryBuilder = supabaseAdmin
    .from('guardian_athlete_links')
    .select('id, guardian_user_id, athlete_id, relationship, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (['active', 'pending', 'revoked'].includes(statusFilter)) {
    queryBuilder = queryBuilder.eq('status', statusFilter)
  }

  const { data: linksRows, error: linksError } = await queryBuilder
  if (linksError) throw linksError

  const links = (linksRows || []) as GuardianLinkRow[]
  const shouldLoadPendingInvites = statusFilter === 'all' || statusFilter === 'pending'
  const { data: inviteRows, error: invitesError } = shouldLoadPendingInvites
    ? await supabaseAdmin
        .from('guardian_invites')
        .select('id, athlete_id, athlete_name, guardian_email, status, created_at, expires_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(limit)
    : { data: [], error: null }

  if (invitesError) throw invitesError

  const pendingInvites = (inviteRows || []) as Array<{
    id: string
    athlete_id: string
    athlete_name?: string | null
    guardian_email?: string | null
    status: string
    created_at: string
    expires_at?: string | null
  }>

  const profileIds = Array.from(
    new Set([
      ...links.map((row) => row.athlete_id),
      ...links.map((row) => row.guardian_user_id).filter(Boolean) as string[],
      ...pendingInvites.map((row) => row.athlete_id),
    ]),
  )

  const { data: profiles } = profileIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role, account_owner_type, guardian_name, guardian_email')
        .in('id', profileIds)
    : { data: [] }

  const profileMap = toMap((profiles || []) as Array<{
    id: string
    full_name?: string | null
    email?: string | null
    role?: string | null
    account_owner_type?: string | null
    guardian_name?: string | null
    guardian_email?: string | null
  }>)

  const { users: authUsers } = await listAllAuthUsers()
  const authUserMap = new Map((authUsers || []).map((user) => [user.id, user]))

  const enrichedLinks = links
    .map((link) => {
      const athlete = profileMap[link.athlete_id] || null
      const guardian = link.guardian_user_id ? profileMap[link.guardian_user_id] || null : null
      const athleteAuthUser = authUserMap.get(link.athlete_id) || null
      const guardianAuthUser = link.guardian_user_id ? authUserMap.get(link.guardian_user_id) || null : null
      return {
        ...link,
        source: 'link' as const,
        athlete_name: athlete?.full_name || 'Athlete',
        athlete_email: athlete?.email || null,
        athlete_role: athlete?.role || null,
        athlete_email_status: getEmailVerificationStatus(athleteAuthUser),
        guardian_name: guardian?.full_name || null,
        guardian_email: guardian?.email || null,
        guardian_role: guardian?.role || null,
        guardian_email_status: guardianAuthUser ? getEmailVerificationStatus(guardianAuthUser) : 'No linked guardian account',
      }
    })

  const enrichedInvites = pendingInvites.map((invite) => {
    const athlete = profileMap[invite.athlete_id] || null
    const athleteAuthUser = authUserMap.get(invite.athlete_id) || null
    return {
      id: `invite:${invite.id}`,
      source: 'invite' as const,
      guardian_user_id: null,
      athlete_id: invite.athlete_id,
      relationship: 'invite_pending',
      status: 'pending',
      created_at: invite.created_at,
      updated_at: invite.created_at,
      invite_expires_at: invite.expires_at || null,
      athlete_name: athlete?.full_name || invite.athlete_name || 'Athlete',
      athlete_email: athlete?.email || null,
      athlete_role: athlete?.role || null,
      athlete_email_status: getEmailVerificationStatus(athleteAuthUser),
      guardian_name: null,
      guardian_email: invite.guardian_email || null,
      guardian_role: 'guardian_invite',
      guardian_email_status: 'Invite pending',
    }
  })

  const filtered = [...enrichedLinks, ...enrichedInvites]
    .filter((row) => {
      if (!query) return true
      const haystack = [
        row.athlete_name,
        row.athlete_email,
        row.guardian_name,
        row.guardian_email,
        row.relationship,
        row.status,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
      return haystack.includes(query)
    })

  const { data: guardianCandidatesRows } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, role, account_owner_type')
    .or('account_owner_type.eq.guardian,role.eq.athlete')
    .limit(500)

  const guardianCandidates = (guardianCandidatesRows || [])
    .filter((row) => row.account_owner_type === 'guardian' || row.role === 'athlete')
    .map((row) => ({
      id: row.id,
      full_name: row.full_name || null,
      email: row.email || null,
      role: row.role || null,
      account_owner_type: row.account_owner_type || null,
    }))

  const emailClusters = new Map<string, Array<{ id: string; full_name?: string | null; email?: string | null }>>()
  guardianCandidates.forEach((candidate) => {
    const key = String(candidate.email || '').trim().toLowerCase()
    if (!key) return
    const existing = emailClusters.get(key) || []
    existing.push(candidate)
    emailClusters.set(key, existing)
  })

  const duplicates = Array.from(emailClusters.entries())
    .filter(([, members]) => members.length > 1)
    .map(([email, members]) => ({
      email,
      members,
    }))

  const summary = {
    total: filtered.length,
    active: filtered.filter((row) => row.status === 'active').length,
    pending: filtered.filter((row) => row.status === 'pending').length,
    revoked: filtered.filter((row) => row.status === 'revoked').length,
    duplicate_guardian_emails: duplicates.length,
  }

  return { links: filtered, summary, guardianCandidates, duplicateGuardianEmails: duplicates }
}

export async function GET(request: Request) {
  const { response } = await requireAdmin()
  if (response) return response

  const { searchParams } = new URL(request.url)
  const status = String(searchParams.get('status') || 'all').trim().toLowerCase()
  const query = String(searchParams.get('query') || '').trim().toLowerCase()
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 300), 1), 1000)

  try {
    const payload = await loadGuardianLinksDataset(status, query, limit)
    return NextResponse.json(payload)
  } catch (routeError: any) {
    return jsonError(routeError?.message || 'Unable to load guardian links.', 500)
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireAdmin()
  if (response || !session) return response ?? jsonError('Unauthorized', 401)

  const payload = await request.json().catch(() => ({}))
  const action = String(payload?.action || '').trim().toLowerCase()
  const reason = String(payload?.reason || '').trim() || null

  if (!action) return jsonError('action is required')

  if (action === 'revoke_link') {
    const linkId = String(payload?.link_id || '').trim()
    if (!linkId) return jsonError('link_id is required')

    const { data: linkRow } = await supabaseAdmin
      .from('guardian_athlete_links')
      .select('id, guardian_user_id, athlete_id, status')
      .eq('id', linkId)
      .maybeSingle()

    if (!linkRow) return jsonError('Link not found', 404)

    await supabaseAdmin
      .from('guardian_athlete_links')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', linkId)

    const { data: activeLinks } = await supabaseAdmin
      .from('guardian_athlete_links')
      .select('guardian_user_id')
      .eq('athlete_id', linkRow.athlete_id)
      .eq('status', 'active')
      .limit(1)

    const activeGuardianUserId = activeLinks?.[0]?.guardian_user_id || null

    if (activeGuardianUserId) {
      const { data: guardianProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, email')
        .eq('id', activeGuardianUserId)
        .maybeSingle()
      await supabaseAdmin
        .from('profiles')
        .update({
          guardian_name: guardianProfile?.full_name || null,
          guardian_email: guardianProfile?.email || null,
        })
        .eq('id', linkRow.athlete_id)
    } else {
      await supabaseAdmin
        .from('profiles')
        .update({ guardian_name: null, guardian_email: null })
        .eq('id', linkRow.athlete_id)
    }

    await logAdminAction({
      action: 'admin.guardian_links.revoke',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'guardian_link',
      targetId: linkId,
      metadata: {
        reason,
        athlete_id: linkRow.athlete_id,
        guardian_user_id: linkRow.guardian_user_id,
      },
    })

    return NextResponse.json({ ok: true })
  }

  if (action === 'relink_guardian') {
    const athleteId = String(payload?.athlete_id || '').trim()
    const guardianUserId = String(payload?.guardian_user_id || '').trim()
    if (!athleteId || !guardianUserId) {
      return jsonError('athlete_id and guardian_user_id are required')
    }

    const { data: guardianProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', guardianUserId)
      .maybeSingle()

    if (!guardianProfile) return jsonError('Guardian profile not found', 404)

    await supabaseAdmin
      .from('guardian_athlete_links')
      .upsert(
        {
          guardian_user_id: guardianUserId,
          athlete_id: athleteId,
          relationship: 'parent',
          status: 'active',
          created_by: session.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guardian_user_id,athlete_id' },
      )

    await supabaseAdmin
      .from('guardian_athlete_links')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('athlete_id', athleteId)
      .neq('guardian_user_id', guardianUserId)
      .eq('status', 'active')

    await supabaseAdmin
      .from('profiles')
      .update({
        guardian_name: guardianProfile.full_name || null,
        guardian_email: guardianProfile.email || null,
        guardian_approval_rule: 'required',
      })
      .eq('id', athleteId)

    await supabaseAdmin
      .from('guardian_approvals')
      .update({
        guardian_user_id: guardianUserId,
        guardian_name: guardianProfile.full_name || null,
        guardian_email: guardianProfile.email || null,
      })
      .eq('athlete_id', athleteId)
      .eq('status', 'pending')

    await logAdminAction({
      action: 'admin.guardian_links.relink',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'athlete',
      targetId: athleteId,
      metadata: {
        reason,
        guardian_user_id: guardianUserId,
      },
    })

    return NextResponse.json({ ok: true })
  }

  if (action === 'merge_duplicate_guardians') {
    const sourceGuardianUserId = String(payload?.source_guardian_user_id || '').trim()
    const targetGuardianUserId = String(payload?.target_guardian_user_id || '').trim()
    if (!sourceGuardianUserId || !targetGuardianUserId) {
      return jsonError('source_guardian_user_id and target_guardian_user_id are required')
    }
    if (sourceGuardianUserId === targetGuardianUserId) {
      return jsonError('source and target guardian ids must be different')
    }

    const { data: sourceLinks } = await supabaseAdmin
      .from('guardian_athlete_links')
      .select('id, athlete_id, status')
      .eq('guardian_user_id', sourceGuardianUserId)

    for (const link of sourceLinks || []) {
      const { data: existingTarget } = await supabaseAdmin
        .from('guardian_athlete_links')
        .select('id')
        .eq('guardian_user_id', targetGuardianUserId)
        .eq('athlete_id', link.athlete_id)
        .maybeSingle()

      if (existingTarget?.id) {
        await supabaseAdmin
          .from('guardian_athlete_links')
          .update({ status: 'revoked', updated_at: new Date().toISOString() })
          .eq('id', link.id)
      } else {
        await supabaseAdmin
          .from('guardian_athlete_links')
          .update({ guardian_user_id: targetGuardianUserId, updated_at: new Date().toISOString() })
          .eq('id', link.id)
      }
    }

    await supabaseAdmin
      .from('guardian_approvals')
      .update({ guardian_user_id: targetGuardianUserId })
      .eq('guardian_user_id', sourceGuardianUserId)

    await logAdminAction({
      action: 'admin.guardian_links.merge_duplicate_guardians',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'guardian_profile',
      targetId: targetGuardianUserId,
      metadata: {
        reason,
        source_guardian_user_id: sourceGuardianUserId,
        target_guardian_user_id: targetGuardianUserId,
      },
    })

    return NextResponse.json({ ok: true })
  }

  return jsonError('Unsupported action')
}
