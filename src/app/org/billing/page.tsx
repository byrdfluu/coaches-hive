'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { getActiveOrganizationId } from '@/lib/clientOrganization'

type FeePayload = {
  base_fee_range?: string
  transaction_fee?: number
  marketplace_fee?: number
}

type SubscriptionPayload = {
  has_access?: boolean
  status?: string
  tier?: string | null
  plan_key?: string | null
  billing_interval?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  currency?: string | null
  base_amount?: number | null
  renewal_amount?: number | null
}

type BillingWorkspace = { workspaceId: string; organizationId: string; actingRole: string }

const money = (cents?: number | null, currency = 'usd') => typeof cents === 'number'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
  : '—'

const date = (value?: string | null) => value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
  : '—'

export default function OrgBillingPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const redirectToApp = searchParams?.get('redirect') === 'app'
  const portalReturn = searchParams?.get('portal_return') === '1'

  useEffect(() => {
    if (portalReturn && redirectToApp) {
      window.location.assign('coacheshive://billing-updated')
    }
  }, [portalReturn, redirectToApp])

  const [fees, setFees] = useState<FeePayload>({})
  const [billingSettings, setBillingSettings] = useState({
    billing_contact: '',
    tax_id: '',
    billing_address: '',
    invoice_frequency: '',
    plan: 'standard',
  })
  const [coachCount, setCoachCount] = useState(0)
  const [athleteCount, setAthleteCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [portalLoading, setPortalLoading] = useState(false)
  const [subscription, setSubscription] = useState<SubscriptionPayload | null>(null)
  const [billingWorkspace, setBillingWorkspace] = useState<BillingWorkspace | null>(null)

  const handleOpenCustomerPortal = async () => {
    if (portalLoading) return
    setPortalLoading(true)
    try {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(billingWorkspace ? {
            'X-Workspace-ID': billingWorkspace.workspaceId,
            'X-Acting-Role': billingWorkspace.actingRole,
          } : {}),
        },
        body: JSON.stringify({
          ...(redirectToApp ? { return_url: '/org/billing?portal_return=1&redirect=app' } : {}),
          workspace_id: billingWorkspace?.workspaceId,
          organization_id: billingWorkspace?.organizationId,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.url) {
        setToast(data?.error || 'Unable to open billing portal.')
        return
      }
      if (redirectToApp) {
        window.location.href = data.url
      } else {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setPortalLoading(false)
    }
  }
  useEffect(() => {
    let active = true
    const loadBilling = async () => {
      setLoading(true)
      const feeResponse = await fetch('/api/org/fees')
      if (!active) return
      if (!feeResponse.ok) {
        setToast('Unable to load fee information — try refreshing.')
      } else {
        setFees(await feeResponse.json())
      }

      const settingsResponse = await fetch('/api/org/settings')
      if (!active) return
      if (!settingsResponse.ok) {
        setToast('Unable to load billing settings — try refreshing.')
      } else {
        const settingsPayload = await settingsResponse.json()
        setBillingSettings((prev) => ({
          ...prev,
          ...(settingsPayload.settings || {}),
        }))
      }

      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      const orgId = await getActiveOrganizationId(supabase)
      if (!orgId) return
      const [roleResponse, sessionResult] = await Promise.all([
        fetch('/api/roles/available', { cache: 'no-store' }),
        supabase.auth.getSession(),
      ])
      const rolePayload = await roleResponse.json().catch(() => ({}))
      const workspace = (rolePayload.workspaces || []).find((item: any) =>
        item.workspace_id === rolePayload.active_workspace_id && item.organization_id === orgId
      ) || (rolePayload.workspaces || []).find((item: any) => item.organization_id === orgId)
      const workspaceRoles = Array.isArray(workspace?.roles) ? workspace.roles.map(String) : []
      const actingRole = workspaceRoles.includes('owner') ? 'owner'
        : workspaceRoles.includes('org_admin') ? 'org_admin'
          : workspaceRoles.includes('admin') ? 'admin'
            : String(rolePayload.active_role || workspaceRoles[0] || '')
      const accessToken = sessionResult.data.session?.access_token
      if (workspace?.workspace_id && accessToken) {
        const context = { workspaceId: workspace.workspace_id, organizationId: orgId, actingRole }
        setBillingWorkspace(context)
        const statusResponse = await fetch(`/api/mobile/subscription/status?workspace_id=${workspace.workspace_id}`, {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Workspace-ID': workspace.workspace_id,
            'X-Acting-Role': actingRole,
          },
        })
        const statusPayload = await statusResponse.json().catch(() => ({}))
        if (statusResponse.ok) setSubscription(statusPayload)
        else setToast(statusPayload?.error?.message || statusPayload?.error || 'Unable to load organization subscription.')
      }
      const { data: members } = await supabase
        .from('organization_memberships')
        .select('role')
        .eq('org_id', orgId)
      if (!active) return
      const membershipRows = (members || []) as Array<{ role?: string | null }>
      const coaches = membershipRows.filter((row) => ['coach', 'assistant_coach'].includes(String(row.role)))
      const athletes = membershipRows.filter((row) => String(row.role) === 'athlete')
      setCoachCount(coaches.length)
      setAthleteCount(athletes.length)
      setLoading(false)
    }
    loadBilling()
    return () => {
      active = false
    }
  }, [supabase])

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        {redirectToApp && !portalReturn && (
          <div className="mb-4 rounded-2xl border border-[#191919] bg-[#191919] px-4 py-3 text-sm font-semibold text-white">
            Manage billing below — you'll return to the Coaches Hive app after updating.
          </div>
        )}
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Billing</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Track plan pricing, usage, and invoices.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-1">
          <div className="lg:hidden"><OrgSidebar /></div>
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Current plan</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : subscription?.plan_key || subscription?.tier || 'No active plan'}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">{subscription?.billing_interval || 'Billing interval unavailable'}</p>
              </div>
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coaches</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : coachCount}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  All organization coaches are included
                </p>
              </div>
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athletes</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : athleteCount}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">included in plan</p>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Subscription status</h2>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Status</p>
                  <p className="mt-1 font-semibold capitalize text-[#191919]">{subscription?.status || (loading ? 'Loading…' : 'Not active')}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Renewal amount</p>
                  <p className="mt-1 font-semibold text-[#191919]">{money(subscription?.renewal_amount ?? subscription?.base_amount, subscription?.currency || 'usd')}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">{subscription?.cancel_at_period_end ? 'Access through' : 'Renews'}</p>
                  <p className="mt-1 font-semibold text-[#191919]">{date(subscription?.current_period_end)}</p>
                </div>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Payment method</h2>
              <p className="mt-2 text-sm text-[#4a4a4a]">Add a card for monthly billing and usage fees.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <p className="text-sm text-[#4a4a4a]">Your payment method is managed securely by Stripe.</p>
                <button
                  type="button"
                  onClick={handleOpenCustomerPortal}
                  disabled={portalLoading}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                >
                  {portalLoading ? 'Opening…' : 'Manage billing'}
                </button>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Compliance-ready billing</h2>
                  <p className="mt-2 text-sm text-[#4a4a4a]">Ensure billing contacts, tax IDs, and invoice settings are on file.</p>
                </div>
                <Link href="/org/settings" className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]">
                  Update billing profile
                </Link>
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Billing contact</p>
                  <p className="mt-1 font-semibold text-[#191919]">{billingSettings.billing_contact || 'Add billing contact'}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Invoice cadence</p>
                  <p className="mt-1 font-semibold text-[#191919]">{billingSettings.invoice_frequency || 'Monthly'}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Tax ID</p>
                  <p className="mt-1 font-semibold text-[#191919]">{billingSettings.tax_id || 'Add tax ID'}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Billing address</p>
                  <p className="mt-1 font-semibold text-[#191919]">{billingSettings.billing_address || 'Add billing address'}</p>
                </div>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Invoices</h2>
              <p className="mt-2 text-sm text-[#4a4a4a]">
                Your full invoice history is available in the Stripe billing portal, including past statements, upcoming charges, and downloadable PDFs.
              </p>
              <button
                type="button"
                onClick={handleOpenCustomerPortal}
                disabled={portalLoading}
                className="mt-4 rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
              >
                {portalLoading ? 'Opening…' : 'View invoices in billing portal'}
              </button>
            </section>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
