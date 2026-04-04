import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { error } = await getSessionRole(['admin', 'superadmin'])
  if (error) return error

  const { searchParams } = new URL(request.url)
  const userId = String(searchParams.get('user_id') || '').trim()
  const email = String(searchParams.get('email') || '').trim().toLowerCase()

  if (!userId && !email) {
    return jsonError('user_id or email is required', 400)
  }

  const profileQuery = supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role, stripe_account_id, bank_last4')

  const { data: profile, error: profileError } = userId
    ? await profileQuery.eq('id', userId).maybeSingle()
    : await profileQuery.eq('email', email).maybeSingle()

  if (profileError) {
    return jsonError(profileError.message, 500)
  }

  if (!profile) {
    return jsonError('Coach profile not found', 404)
  }

  if (String(profile.role || '').trim().toLowerCase() !== 'coach') {
    return jsonError('Selected profile is not a coach account', 400)
  }

  if (!profile.stripe_account_id) {
    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        stripe_account_id: null,
        bank_last4: profile.bank_last4 || null,
      },
      stripe: null,
    })
  }

  try {
    const account = await stripe.accounts.retrieve(profile.stripe_account_id)
    const requirements = 'requirements' in account ? account.requirements : null
    const externalAccounts =
      account.external_accounts && 'data' in account.external_accounts ? account.external_accounts.data : []
    const primaryBank = externalAccounts[0]

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        stripe_account_id: profile.stripe_account_id,
        bank_last4: profile.bank_last4 || null,
      },
      stripe: {
        id: account.id,
        charges_enabled: Boolean(account.charges_enabled),
        payouts_enabled: Boolean(account.payouts_enabled),
        details_submitted: Boolean(account.details_submitted),
        bank_last4: primaryBank && 'last4' in primaryBank ? primaryBank.last4 || null : null,
        currently_due: requirements?.currently_due || [],
        eventually_due: requirements?.eventually_due || [],
        pending_verification: requirements?.pending_verification || [],
        disabled_reason: requirements?.disabled_reason || null,
      },
    })
  } catch (caughtError) {
    return jsonError(
      caughtError instanceof Error ? caughtError.message : 'Unable to fetch Stripe account state',
      500,
    )
  }
}
