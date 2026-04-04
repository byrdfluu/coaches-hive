import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'
import { resolveGuardianUserIdForAthlete } from '@/lib/guardianApproval'
import { sendGuardianInviteEmail } from '@/lib/inviteDelivery'

export const dynamic = 'force-dynamic'

const getGuardianInviteConflictState = async (guardianEmail: string, athleteId: string) => {
  const { data: existingProfile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, account_owner_type')
    .eq('email', guardianEmail)
    .neq('id', athleteId)
    .maybeSingle()

  if (error) {
    console.error('[guardian-invites/request] existing profile lookup failed', error)
    return { message: 'Unable to verify guardian account state.', status: 500 }
  }

  if (!existingProfile) {
    return null
  }

  const ownerType = String(existingProfile.account_owner_type || '').trim().toLowerCase()
  const role = String(existingProfile.role || '').trim().toLowerCase()
  if (ownerType === 'guardian' || role === 'guardian') {
    return null
  }

  return {
    message:
      'This email already belongs to a coach or athlete account. Use a separate guardian email or log in with a guardian account first.',
    status: 409,
  }
}

const getDeliveryFailureMessage = (delivery: { status?: string; error?: string; reason?: string }) => {
  const detail = String(delivery.error || delivery.reason || '').trim()
  if (!detail) {
    return 'Invite saved, but email could not be sent. Please try again.'
  }
  if (/missing postmark configuration/i.test(detail)) {
    return 'Invite saved, but email sending is not configured on the server yet.'
  }
  return `Invite saved, but email could not be sent. ${detail}`
}

export async function POST() {
  try {
    if (!hasSupabaseAdminConfig) {
      return jsonError('Service unavailable', 503)
    }

    const { session, role, error } = await getSessionRole(['athlete'])
    if (error || !session || role !== 'athlete') {
      return jsonError('Unauthorized', 401)
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, guardian_email, account_owner_type')
      .eq('id', session.user.id)
      .maybeSingle()

    if (!profile) {
      return jsonError('Athlete profile not found', 404)
    }

    const guardianEmail = String(profile.guardian_email || '').trim().toLowerCase()
    if (!guardianEmail) {
      return jsonError('Guardian email is required before sending an invite.', 400)
    }

    if (guardianEmail === String(session.user.email || '').trim().toLowerCase()) {
      return jsonError('Guardian email must be different from the athlete email.', 400)
    }

    const guardianUserId = await resolveGuardianUserIdForAthlete(profile.id, {
      id: profile.id,
      full_name: profile.full_name || null,
      guardian_email: guardianEmail,
      account_owner_type: (profile.account_owner_type as 'athlete_adult' | 'athlete_minor' | 'guardian' | null) || null,
    })

    if (guardianUserId) {
      return NextResponse.json({ linked: true, invited: false, guardian_user_id: guardianUserId })
    }

    const guardianInviteConflict = await getGuardianInviteConflictState(guardianEmail, profile.id)
    if (guardianInviteConflict) {
      if (guardianInviteConflict.status === 409) {
        await supabaseAdmin
          .from('guardian_invites')
          .delete()
          .eq('athlete_id', profile.id)
          .eq('guardian_email', guardianEmail)
          .eq('status', 'pending')
      }
      return jsonError(guardianInviteConflict.message, guardianInviteConflict.status)
    }

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: existingInvite, error: existingInviteError } = await supabaseAdmin
      .from('guardian_invites')
      .select('id')
      .eq('guardian_email', guardianEmail)
      .eq('athlete_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingInviteError) {
      console.error('[guardian-invites/request] load existing invite failed', existingInviteError)
      return jsonError('Unable to load guardian invite state.', 500)
    }

    const invitePayload = {
      token,
      guardian_email: guardianEmail,
      athlete_id: profile.id,
      athlete_name: profile.full_name || 'Athlete',
      status: 'pending',
      expires_at: expiresAt,
    }

    const inviteResult = existingInvite?.id
      ? await supabaseAdmin
          .from('guardian_invites')
          .update(invitePayload)
          .eq('id', existingInvite.id)
      : await supabaseAdmin.from('guardian_invites').insert(invitePayload)

    if (inviteResult.error) {
      console.error('[guardian-invites/request] persist invite failed', inviteResult.error)
      return jsonError('Unable to create guardian invite.', 500)
    }

    const delivery = await sendGuardianInviteEmail({
      toEmail: guardianEmail,
      athleteName: profile.full_name || 'Athlete',
      inviteToken: token,
    })

    if (delivery.status !== 'sent') {
      console.error('[guardian-invites/request] email delivery failed', {
        athleteId: profile.id,
        guardianEmail,
        status: delivery.status,
        error: delivery.error || null,
        reason: delivery.reason || null,
      })
      return NextResponse.json(
        { error: getDeliveryFailureMessage(delivery), delivery_status: delivery.status || 'failed' },
        { status: 503 },
      )
    }

    return NextResponse.json({ linked: false, invited: true, email: guardianEmail })
  } catch (routeError) {
    console.error('[guardian-invites/request] unexpected failure', routeError)
    return jsonError('Unable to process guardian invite.', 500)
  }
}
