import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type LinkRow = {
  id: string
  guardian_user_id: string
  athlete_id: string
  relationship: string | null
  status: string
  created_at: string
}

type PendingInviteRow = {
  id: string
  guardian_email: string | null
  athlete_id: string
  athlete_name: string | null
  status: string
  expires_at: string | null
  created_at: string
}

export async function GET() {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const { data: currentProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, account_owner_type')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!currentProfile) {
    return jsonError('Profile not found', 404)
  }

  const userEmail = String(currentProfile.email || session.user.email || '').trim().toLowerCase()
  const isGuardianAccount = currentProfile.account_owner_type === 'guardian'

  if (isGuardianAccount && userEmail) {
    const { data: emailMatchedAthletes } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'athlete')
      .ilike('guardian_email', userEmail)

    if ((emailMatchedAthletes || []).length > 0) {
      const now = new Date().toISOString()
      await supabaseAdmin
        .from('guardian_athlete_links')
        .upsert(
          (emailMatchedAthletes || []).map((athlete) => ({
            guardian_user_id: session.user.id,
            athlete_id: athlete.id,
            relationship: 'parent',
            status: 'active',
            created_by: session.user.id,
            updated_at: now,
          })),
          { onConflict: 'guardian_user_id,athlete_id' },
        )
    }
  }

  const { data: links } = await supabaseAdmin
    .from('guardian_athlete_links')
    .select('id, guardian_user_id, athlete_id, relationship, status, created_at')
    .eq(isGuardianAccount ? 'guardian_user_id' : 'athlete_id', session.user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  const profileIds = new Set<string>()
  ;(links || []).forEach((link) => {
    profileIds.add(isGuardianAccount ? String(link.athlete_id) : String(link.guardian_user_id))
  })

  const { data: relatedProfiles } = profileIds.size
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role, account_owner_type')
        .in('id', Array.from(profileIds))
    : { data: [] }

  const profileMap = new Map((relatedProfiles || []).map((profile) => [String(profile.id), profile]))

  const { data: pendingInvites } = !isGuardianAccount
    ? await supabaseAdmin
        .from('guardian_invites')
        .select('id, guardian_email, athlete_id, athlete_name, status, expires_at, created_at')
        .eq('athlete_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    : { data: [] }

  return NextResponse.json({
    mode: isGuardianAccount ? 'guardian' : 'athlete',
    links: ((links || []) as LinkRow[]).map((link) => {
      const related = profileMap.get(isGuardianAccount ? String(link.athlete_id) : String(link.guardian_user_id))
      return {
        id: link.id,
        relationship: link.relationship || 'parent',
        created_at: link.created_at,
        athlete_id: link.athlete_id,
        guardian_user_id: link.guardian_user_id,
        related_profile: {
          id: related?.id || null,
          full_name: related?.full_name || null,
          email: related?.email || null,
          role: related?.role || null,
          account_owner_type: related?.account_owner_type || null,
        },
      }
    }),
    pending_invites: ((pendingInvites || []) as PendingInviteRow[]).map((invite) => ({
      id: invite.id,
      guardian_email: invite.guardian_email || null,
      athlete_id: invite.athlete_id,
      athlete_name: invite.athlete_name || null,
      status: invite.status,
      expires_at: invite.expires_at,
      created_at: invite.created_at,
    })),
  })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const athleteId = String(body?.athlete_id || '').trim()
  const athleteEmail = String(body?.athlete_email || '').trim().toLowerCase()

  const { data: guardianProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, account_owner_type')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!guardianProfile) return jsonError('Profile not found', 404)
  if (guardianProfile.account_owner_type !== 'guardian') {
    return jsonError('Only guardian accounts can link athletes.', 403)
  }

  if (!athleteId && !athleteEmail) {
    return jsonError('athlete_id or athlete_email is required')
  }

  const athleteQuery = supabaseAdmin
    .from('profiles')
    .select('id, role, full_name, guardian_email, guardian_name')

  const { data: athleteProfile } = athleteId
    ? await athleteQuery.eq('id', athleteId).maybeSingle()
    : await athleteQuery.eq('email', athleteEmail).maybeSingle()

  if (!athleteProfile) {
    return jsonError('Athlete profile not found', 404)
  }

  if (athleteProfile.role !== 'athlete') {
    return jsonError('Selected profile is not an athlete.', 400)
  }

  const guardianEmail = String(guardianProfile.email || session.user.email || '').trim().toLowerCase()
  const existingGuardianEmail = String(athleteProfile.guardian_email || '').trim().toLowerCase()

  if (existingGuardianEmail && guardianEmail && existingGuardianEmail !== guardianEmail) {
    return jsonError('This athlete is already linked to a different guardian email.', 409)
  }

  await supabaseAdmin
    .from('profiles')
    .update({
      guardian_email: guardianEmail || null,
      guardian_name: athleteProfile.guardian_name || guardianProfile.full_name || null,
      guardian_approval_rule: 'required',
      account_owner_type: 'athlete_minor',
    })
    .eq('id', athleteProfile.id)

  const { data: linkRow, error: linkError } = await supabaseAdmin
    .from('guardian_athlete_links')
    .upsert(
      {
        guardian_user_id: guardianProfile.id,
        athlete_id: athleteProfile.id,
        relationship: 'parent',
        status: 'active',
        created_by: guardianProfile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'guardian_user_id,athlete_id' },
    )
    .select('id, guardian_user_id, athlete_id, relationship, status, created_at')
    .maybeSingle()

  if (linkError || !linkRow) {
    return jsonError(linkError?.message || 'Unable to link athlete', 500)
  }

  return NextResponse.json({
    linked: true,
    link: {
      ...linkRow,
      athlete_name: athleteProfile.full_name || 'Athlete',
      athlete_email: athleteEmail || null,
    },
  })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const linkId = String(body?.link_id || '').trim()
  const inviteId = String(body?.invite_id || '').trim()

  if (!linkId && !inviteId) {
    return jsonError('link_id or invite_id is required')
  }

  const { data: currentProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, account_owner_type')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!currentProfile) {
    return jsonError('Profile not found', 404)
  }

  const isGuardianAccount = currentProfile.account_owner_type === 'guardian'

  if (inviteId) {
    if (isGuardianAccount) {
      return jsonError('Guardian accounts cannot delete athlete guardian requests.', 403)
    }

    const { data: inviteRow } = await supabaseAdmin
      .from('guardian_invites')
      .select('id, athlete_id, status')
      .eq('id', inviteId)
      .maybeSingle()

    if (!inviteRow || inviteRow.athlete_id !== session.user.id) {
      return jsonError('Guardian invite not found', 404)
    }

    await supabaseAdmin.from('guardian_invites').delete().eq('id', inviteId)
    return NextResponse.json({ ok: true, deleted: 'invite' })
  }

  const { data: linkRow } = await supabaseAdmin
    .from('guardian_athlete_links')
    .select('id, athlete_id, guardian_user_id, status')
    .eq('id', linkId)
    .maybeSingle()

  if (!linkRow) {
    return jsonError('Guardian link not found', 404)
  }

  const canManageLink = isGuardianAccount
    ? linkRow.guardian_user_id === session.user.id
    : linkRow.athlete_id === session.user.id

  if (!canManageLink) {
    return jsonError('Forbidden', 403)
  }

  await supabaseAdmin
    .from('guardian_athlete_links')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', linkId)

  const { data: remainingLinks } = await supabaseAdmin
    .from('guardian_athlete_links')
    .select('guardian_user_id')
    .eq('athlete_id', linkRow.athlete_id)
    .eq('status', 'active')
    .limit(1)

  const nextGuardianUserId = remainingLinks?.[0]?.guardian_user_id || null

  if (nextGuardianUserId) {
    const { data: guardianProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', nextGuardianUserId)
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
      .update({
        guardian_name: null,
        guardian_email: null,
        guardian_phone: null,
      })
      .eq('id', linkRow.athlete_id)
  }

  return NextResponse.json({ ok: true, deleted: 'link' })
}
