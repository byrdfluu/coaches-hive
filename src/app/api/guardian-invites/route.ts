import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmailVerificationCode } from '@/lib/authVerification'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status })

const isExistingUserError = (message?: string | null) =>
  /already.*registered|already.*exists|user.*exists|email.*exists|duplicate/i.test(String(message || ''))

// GET /api/guardian-invites?token=xxx — validate invite token, return public details
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')?.trim()
  if (!token) return jsonError('Token is required', 400)

  const { data: invite } = await supabaseAdmin
    .from('guardian_invites')
    .select('id, guardian_email, athlete_name, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return jsonError('Invalid or expired invite link.', 404)
  if (invite.status !== 'pending') {
    return NextResponse.json({ valid: false, reason: invite.status === 'accepted' ? 'already_accepted' : 'expired' })
  }
  if (new Date(invite.expires_at) < new Date()) {
    await supabaseAdmin.from('guardian_invites').update({ status: 'expired' }).eq('token', token)
    return NextResponse.json({ valid: false, reason: 'expired' })
  }

  return NextResponse.json({
    valid: true,
    guardian_email: invite.guardian_email,
    athlete_name: invite.athlete_name,
  })
}

// POST /api/guardian-invites — accept invite and create guardian account
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const token = String(body?.token || '').trim()
  const fullName = String(body?.full_name || '').trim()
  const password = String(body?.password || '')

  if (!token) return jsonError('Token is required')
  if (!fullName) return jsonError('Full name is required')
  if (!password || password.length < 8) return jsonError('Password must be at least 8 characters')

  trackServerFlowEvent({
    flow: 'guardian_invite_accept',
    step: 'start',
    status: 'started',
    metadata: { tokenPresent: Boolean(token) },
  })

  const { data: invite } = await supabaseAdmin
    .from('guardian_invites')
    .select('id, guardian_email, athlete_id, athlete_name, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return jsonError('Invalid or expired invite link.', 404)
  if (invite.status !== 'pending') {
    return jsonError(
      invite.status === 'accepted'
        ? 'This invite has already been used. Please log in.'
        : 'This invite has expired.',
      409,
    )
  }
  if (new Date(invite.expires_at) < new Date()) {
    await supabaseAdmin.from('guardian_invites').update({ status: 'expired' }).eq('token', token)
    return jsonError('This invite link has expired.', 410)
  }

  const email = invite.guardian_email

  // Check if an account already exists with this email
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const alreadyExists = (existingUsers?.users || []).some(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  )
  if (alreadyExists) {
    return jsonError(
      'An account with this email already exists. Please log in and link your athlete from Guardian Settings.',
      409,
    )
  }

  // Create the guardian user account
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'guardian',
      full_name: fullName,
      lifecycle_state: 'awaiting_verification',
      lifecycle_updated_at: new Date().toISOString(),
    },
  })

  if (createError || !created.user?.id) {
    console.error('[guardian-invites] createUser failed', createError)
    if (isExistingUserError(createError?.message)) {
      return jsonError(
        'An account with this email already exists. Please log in and link your athlete from Guardian Settings.',
        409,
      )
    }
    trackServerFlowFailure(createError || new Error('Guardian account creation returned no user id'), {
      flow: 'guardian_invite_accept',
      step: 'create_user',
      metadata: { email },
    })
    return jsonError('Unable to create account. Please try again.', 503)
  }

  const guardianId = created.user.id

  // Create guardian profile. Match the normal signup flow by falling back to
  // a minimal profile payload if guardian-specific columns reject the richer shape.
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
    id: guardianId,
    full_name: fullName,
    role: 'guardian',
    email,
    account_owner_type: 'guardian',
  })

  if (profileError) {
    const { error: fallbackProfileError } = await supabaseAdmin.from('profiles').upsert({
      id: guardianId,
      full_name: fullName,
      role: 'guardian',
      email,
    })

    if (fallbackProfileError) {
      trackServerFlowFailure(fallbackProfileError, {
        flow: 'guardian_invite_accept',
        step: 'profile_upsert',
        userId: guardianId,
        role: 'guardian',
        entityId: invite.athlete_id,
        metadata: { email, initialError: profileError.message || null },
      })
      await supabaseAdmin.auth.admin.deleteUser(guardianId).catch(() => null)
      return jsonError('Account setup failed. Please try again.', 503)
    }
  }

  // Create/confirm the guardian-athlete link
  const { error: linkError } = await supabaseAdmin
    .from('guardian_athlete_links')
    .upsert(
      {
        guardian_user_id: guardianId,
        athlete_id: invite.athlete_id,
        relationship: 'parent',
        status: 'active',
        created_by: invite.athlete_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'guardian_user_id,athlete_id', ignoreDuplicates: false },
    )

  if (linkError) {
    console.error('[guardian-invites] link upsert failed', linkError)
    trackServerFlowFailure(linkError, {
      flow: 'guardian_invite_accept',
      step: 'guardian_link_upsert',
      userId: guardianId,
      role: 'guardian',
      entityId: invite.athlete_id,
      metadata: { email },
    })
    try {
      await supabaseAdmin.from('profiles').delete().eq('id', guardianId)
    } catch {
      // Best-effort cleanup only.
    }
    await supabaseAdmin.auth.admin.deleteUser(guardianId).catch(() => null)
    return jsonError('Account setup failed. Please try again.', 503)
  }

  // Mark invite accepted
  await supabaseAdmin
    .from('guardian_invites')
    .update({ status: 'accepted' })
    .eq('token', token)

  // Send verification code so guardian can complete sign-in
  const codeResult = await sendEmailVerificationCode({ email, role: 'guardian' })
  if (!codeResult.ok) {
    // Account is created — verification can be resent from login. Non-fatal.
    console.warn('[guardian-invites] verification code send failed', codeResult.error)
    trackServerFlowFailure(codeResult.error || new Error('Verification code delivery failed'), {
      flow: 'guardian_invite_accept',
      step: 'verification_code_send',
      userId: guardianId,
      role: 'guardian',
      entityId: invite.athlete_id,
      metadata: { email },
    })
    return NextResponse.json({ created: true, code_sent: false })
  }

  trackServerFlowEvent({
    flow: 'guardian_invite_accept',
    step: 'complete',
    status: 'succeeded',
    userId: guardianId,
    role: 'guardian',
    entityId: invite.athlete_id,
    metadata: { email, codeSent: true },
  })

  return NextResponse.json({ created: true, code_sent: true, code_length: codeResult.codeLength })
}
