import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolvePreferredSignInRole, roleToPath } from '@/lib/roleRedirect'
import {
  buildLifecycleSnapshot,
  getActiveTierForUser,
  normalizeRoleForLifecycle,
  normalizeTierForLifecycleRole,
} from '@/lib/lifecycleOrchestration'
import { queueOperationTaskSafely } from '@/lib/operations'
import { recordReferralSignup } from '@/lib/referrals'
import { resolveBillingInfoForActor } from '@/lib/subscriptionLifecycle'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const typeParam = searchParams.get('type')
  const roleParam = searchParams.get('role')
  const tierParam = searchParams.get('tier')
  const refParam = searchParams.get('ref')
  const nextParam = searchParams.get('next')

  if (tokenHash && typeParam === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    })
    if (error) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'Reset link is invalid or expired. Please request a new one.')
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.redirect(new URL('/auth/reset', request.url))
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      if (error.message.toLowerCase().includes('code verifier')) {
        await queueOperationTaskSafely({
          type: 'auth_recovery',
          title: 'PKCE verifier missing during auth callback',
          priority: 'high',
          owner: 'Security',
          entity_type: 'auth_flow',
          entity_id: roleParam || 'unknown',
          max_attempts: 5,
          idempotency_key: `auth_pkce:${roleParam || 'unknown'}:${tierParam || 'na'}`,
          last_error: error.message,
          metadata: {
            route: '/auth/callback',
            role: roleParam || null,
            tier: tierParam || null,
            ref: refParam || null,
          },
        })
        const verifyUrl = new URL('/auth/verify', request.url)
        if (roleParam) verifyUrl.searchParams.set('role', roleParam)
        if (tierParam) verifyUrl.searchParams.set('tier', tierParam)
        if (refParam) verifyUrl.searchParams.set('ref', refParam)
        verifyUrl.searchParams.set('code', code)
        return NextResponse.redirect(verifyUrl)
      }
      await queueOperationTaskSafely({
        type: 'auth_recovery',
        title: 'Auth callback exchange failed',
        priority: 'high',
        owner: 'Security',
        entity_type: 'auth_flow',
        entity_id: roleParam || 'unknown',
        max_attempts: 5,
        idempotency_key: `auth_exchange:${roleParam || 'unknown'}:${tierParam || 'na'}`,
        last_error: error.message,
        metadata: {
          route: '/auth/callback',
          role: roleParam || null,
          tier: tierParam || null,
          ref: refParam || null,
        },
      })
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'Unable to complete sign in. Please try again.')
      return NextResponse.redirect(loginUrl)
    }

    if (nextParam === '/auth/reset') {
      return NextResponse.redirect(new URL('/auth/reset', request.url))
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'Unable to complete sign in. Please log in again.')
    return NextResponse.redirect(loginUrl)
  }

  const user = session.user

  // OAuth providers (Google, etc.) verify the user's email before redirecting back.
  // If Supabase hasn't stamped email_confirmed_at yet, confirm it now so the
  // lifecycle snapshot and middleware both see emailConfirmed = true.
  let oauthEmailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at)
  if (!oauthEmailConfirmed) {
    await supabaseAdmin.auth.admin.updateUserById(user.id, { email_confirm: true }).catch(() => null)
    oauthEmailConfirmed = true
  }

  const metadata = user.user_metadata || {}
  const metadataRoles = Array.isArray(metadata.roles)
    ? metadata.roles.map((value: unknown) => String(value || '').trim()).filter(Boolean)
    : []
  const explicitPortalIntent = Boolean(roleParam || nextParam)
  const defaultSignInRole = !explicitPortalIntent
    ? resolvePreferredSignInRole({
        baseRole: (metadata.role as string | undefined) || null,
        activeRole: (metadata.active_role as string | undefined) || null,
        roles: metadataRoles,
      })
    : null
  const role = (roleParam || defaultSignInRole || metadata.active_role || metadata.role || undefined) as string | undefined
  const fullName = (metadata.full_name || metadata.name || user.email || '').trim()
  const avatarUrl = metadata.avatar_url || metadata.picture || null

  const { error: profileUpsertError } = await supabase.from('profiles').upsert({
    id: user.id,
    full_name: fullName || null,
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
  })
  if (profileUpsertError) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'Unable to finish sign in. Please try again.')
    return NextResponse.redirect(loginUrl)
  }

  const callbackRefCode = String(refParam || metadata.ref_code || '').trim().toUpperCase()
  if (callbackRefCode) {
    const referralResult = await recordReferralSignup({
      refereeId: user.id,
      code: callbackRefCode,
      role: role || null,
    })
    if (!referralResult.ok && referralResult.status !== 'already_recorded' && referralResult.status !== 'already_referred') {
      console.warn('[auth/callback] referral capture issue:', referralResult.status, referralResult.message || '')
    }
  }

  const lifecycleRole = normalizeRoleForLifecycle(role)
  if (lifecycleRole !== 'coach' && lifecycleRole !== 'athlete' && lifecycleRole !== 'org_admin') {
    return NextResponse.redirect(new URL(roleToPath(role), request.url))
  }

  // Only normalize if a tier was actually provided — never default to 'standard'/'starter'/etc.
  // when no tier exists, because that would stamp plan_selected and skip /select-plan.
  const rawTier = (tierParam || metadata.selected_tier || null) as string | null
  const selectedTier = rawTier ? normalizeTierForLifecycleRole(lifecycleRole, rawTier) : null
  const activeTier = await getActiveTierForUser({
    supabase,
    userId: user.id,
    role: lifecycleRole,
    selectedTierHint: selectedTier || metadata.selected_tier || null,
    orgIdHint: (metadata.current_org_id as string | null) || null,
    resolveLiveBillingInfo: resolveBillingInfoForActor,
  })
  const snapshot = buildLifecycleSnapshot({
    role: lifecycleRole,
    emailConfirmed: oauthEmailConfirmed,
    suspended: Boolean(metadata.suspended),
    selectedTier,
    activeTier,
    lifecycleStateHint: metadata.lifecycle_state as string | null,
  })

  const { error: metadataUpdateError } = await supabase.auth.updateUser({
    data: {
      ...metadata,
      role: metadata.role || role || lifecycleRole,
      active_role: role || metadata.active_role || metadata.role || lifecycleRole,
      selected_tier: selectedTier || metadata.selected_tier || undefined,
      lifecycle_state: snapshot.state,
      lifecycle_updated_at: new Date().toISOString(),
      ref_code: refParam || metadata.ref_code || undefined,
    },
  })
  if (metadataUpdateError) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'Unable to finish sign in. Please try again.')
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.redirect(new URL(snapshot.nextPath, request.url))
}
