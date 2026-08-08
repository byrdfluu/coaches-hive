import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ORGANIZATION_COACH_ROLES = new Set(['coach', 'assistant_coach', 'head_coach'])

export type OrgCoachBillingSummary = {
  activeCoachCount: number
  includedCoachCount: number
  additionalCoachCount: number
  coachIds: string[]
  reasons: Record<string, string[]>
}

export type OrgCoachSeatChangePreview = {
  activeCoachCount: number
  includedCoachCount: number
  currentAdditionalCoachCount: number
  nextAdditionalCoachCount: number
  createsPaidSeat: false
  amountDueNow: 0
  currency: 'usd'
  billingInterval: 'month' | 'year'
  recurringSeatAmount: 0
  deltaCoachCount: 1 | -1
}

export const calculateActiveOrgCoachCount = async (orgId: string): Promise<OrgCoachBillingSummary> => {
  const { data, error } = await supabaseAdmin.from('organization_memberships')
    .select('user_id, role, status').eq('org_id', orgId).in('role', Array.from(ORGANIZATION_COACH_ROLES))
  if (error) throw error
  const coachIds = Array.from(new Set((data || [])
    .filter((row) => !row.status || row.status === 'active')
    .map((row) => String(row.user_id)).filter(Boolean)))
  return {
    activeCoachCount: coachIds.length,
    includedCoachCount: coachIds.length,
    additionalCoachCount: 0,
    coachIds,
    reasons: Object.fromEntries(coachIds.map((id) => [id, ['covered_by_organization_subscription']])),
  }
}

export const snapshotOrgCoachBilling = async (orgId: string, summary?: OrgCoachBillingSummary) => {
  const resolved = summary || await calculateActiveOrgCoachCount(orgId)
  const { data: subscription } = await supabaseAdmin.from('platform_subscriptions')
    .select('id').eq('owner_type', 'org').eq('owner_id', orgId).maybeSingle()
  await supabaseAdmin.from('org_coach_billing_snapshots').insert({
    org_id: orgId, subscription_id: subscription?.id || null,
    active_coach_count: resolved.activeCoachCount, included_coach_count: resolved.activeCoachCount,
    additional_coach_count: 0, coach_ids: resolved.coachIds, reasons: resolved.reasons,
  })
  return resolved
}

// Retained as a no-charge compatibility hook for older clients and routes.
export const syncOrgCoachSeatQuantity = async (orgId: string) => {
  const summary = await snapshotOrgCoachBilling(orgId)
  await supabaseAdmin.from('platform_subscriptions').update({
    stripe_coach_seat_item_id: null, included_coach_quantity: summary.activeCoachCount,
    billable_coach_quantity: 0, updated_at: new Date().toISOString(),
  }).eq('owner_type', 'org').eq('owner_id', orgId)
  return summary
}

export const previewOrgCoachSeatChange = async (orgId: string, action: 'invite' | 'remove', prorationDate = Math.floor(Date.now() / 1000)) => {
  const summary = await calculateActiveOrgCoachCount(orgId)
  const deltaCoachCount = action === 'invite' ? 1 : -1
  return {
    activeCoachCount: summary.activeCoachCount,
    includedCoachCount: summary.activeCoachCount,
    currentAdditionalCoachCount: 0,
    nextAdditionalCoachCount: 0,
    createsPaidSeat: false as const,
    amountDueNow: 0 as const,
    currency: 'usd' as const,
    billingInterval: 'month' as const,
    recurringSeatAmount: 0 as const,
    deltaCoachCount: deltaCoachCount as 1 | -1,
    prorationDate,
  }
}

export const previewOrgCoachSeatAddition = (orgId: string, prorationDate?: number) =>
  previewOrgCoachSeatChange(orgId, 'invite', prorationDate)

export const purchaseOrgCoachSeatAddition = async ({ orgId }: { orgId: string; inviteId: string; expectedAdditionalCoachCount: number; prorationDate: number }) =>
  previewOrgCoachSeatAddition(orgId)
