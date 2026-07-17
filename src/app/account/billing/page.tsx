import { redirect } from 'next/navigation'
import AccountBillingPanel from '@/components/AccountBillingPanel'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import {
  isBillingAccessActive,
  resolveBillingInfoForActor,
  resolveBillingRole,
  type BillingRole,
} from '@/lib/subscriptionLifecycle'

export const dynamic = 'force-dynamic'

const resolveBillingRoleForSession = (metadata: Record<string, unknown> | null | undefined): BillingRole | null => {
  const roleState = getSessionRoleState(metadata)
  const candidates = Array.from(new Set([
    roleState.currentRole,
    roleState.activeRole,
    roleState.preferredOrgRole,
    roleState.baseRole,
    ...roleState.availableRoles,
  ].filter(Boolean))) as string[]

  for (const role of candidates) {
    const billingRole = resolveBillingRole(role)
    if (billingRole) return billingRole
  }
  return null
}

export default async function AccountBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ portal_return?: string; redirect?: string }>
}) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login?next=/account/billing')
  }

  const roleState = getSessionRoleState(session.user.user_metadata)
  const billingRole = resolveBillingRoleForSession(session.user.user_metadata)
  if (billingRole === 'org') {
    redirect('/org/billing?redirect=app')
  }

  const params = await searchParams
  if (!billingRole) {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Account billing</p>
          <h1 className="mt-3 text-3xl font-semibold text-[#191919]">Billing unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">
            This account type does not have a Coaches Hive subscription billing area.
          </p>
        </div>
      </main>
    )
  }

  const billingInfo = await resolveBillingInfoForActor({
    userId: session.user.id,
    billingRole,
    orgIdHint: roleState.currentOrgId,
  })

  const normalizedBillingInfo = isBillingAccessActive(billingInfo.status)
    ? billingInfo
    : { ...billingInfo, status: null, cancel_at_period_end: false }

  return (
    <AccountBillingPanel
      billingInfo={normalizedBillingInfo}
      billingRole={billingRole}
      portalReturn={params.portal_return === '1'}
      redirectToApp={params.redirect === 'app'}
    />
  )
}
