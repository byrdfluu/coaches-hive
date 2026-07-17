import {
  sendMarketplaceNewOrderSellerEmail,
  sendMarketplaceOrderConfirmationEmail,
} from '@/lib/email'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const toNumber = (value: unknown) => {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric : 0
}

const loadProfile = async (userId?: string | null) => {
  if (!userId) return null
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', userId)
    .maybeSingle()
  return data || null
}

const loadOrgSeller = async (orgId?: string | null) => {
  if (!orgId) return null

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('org_name')
    .eq('org_id', orgId)
    .maybeSingle()

  const { data: memberships } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role, status')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .in('role', ['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director'])
    .limit(1)

  const adminUserId = memberships?.[0]?.user_id || null
  const adminProfile = await loadProfile(adminUserId)
  if (!adminProfile?.email) return null

  return {
    email: adminProfile.email,
    name: orgSettings?.org_name || adminProfile.full_name || 'Organization',
  }
}

const sendBuyerAndSellerEmails = async (params: {
  orderId: string
  buyerId?: string | null
  coachId?: string | null
  orgId?: string | null
  productName?: string | null
  amount?: number | null
  currency?: string | null
  buyerDashboardUrl?: string | null
  sellerDashboardUrl?: string | null
}) => {
  const [buyer, coachSeller, orgSeller] = await Promise.all([
    loadProfile(params.buyerId),
    loadProfile(params.coachId),
    loadOrgSeller(params.orgId),
  ])

  if (buyer?.email) {
    await sendMarketplaceOrderConfirmationEmail({
      toEmail: buyer.email,
      toName: buyer.full_name,
      productName: params.productName,
      amount: params.amount,
      currency: params.currency || 'usd',
      orderId: params.orderId,
      dashboardUrl: params.buyerDashboardUrl || '/athlete/marketplace/orders',
    })
  }

  const seller = coachSeller?.email
    ? { email: coachSeller.email, name: coachSeller.full_name }
    : orgSeller

  if (seller?.email) {
    await sendMarketplaceNewOrderSellerEmail({
      toEmail: seller.email,
      toName: seller.name,
      productName: params.productName,
      buyerName: buyer?.full_name,
      amount: params.amount,
      currency: params.currency || 'usd',
      orderId: params.orderId,
      dashboardUrl: params.sellerDashboardUrl || (params.coachId ? '/coach/marketplace' : '/org/marketplace'),
    })
  }
}

export const sendLegacyMarketplaceOrderEmails = async (params: {
  orderId: string
  productId?: string | null
  buyerId?: string | null
  coachId?: string | null
  orgId?: string | null
  amount?: number | null
  currency?: string | null
}) => {
  const { data: product } = params.productId
    ? await supabaseAdmin
        .from('products')
        .select('title, name')
        .eq('id', params.productId)
        .maybeSingle()
    : { data: null }

  await sendBuyerAndSellerEmails({
    orderId: params.orderId,
    buyerId: params.buyerId,
    coachId: params.coachId,
    orgId: params.orgId,
    productName: product?.title || product?.name || 'Marketplace item',
    amount: params.amount,
    currency: params.currency || 'usd',
  })
}

export const sendMobileMarketplaceOrderEmails = async (params: {
  orderId: string
  itemId?: string | null
  buyerId?: string | null
  amount?: number | null
  currency?: string | null
}) => {
  const { data: item } = params.itemId
    ? await supabaseAdmin
        .from('marketplace_items')
        .select('name, coach_id, org_id, price')
        .eq('id', params.itemId)
        .maybeSingle()
    : { data: null }

  await sendBuyerAndSellerEmails({
    orderId: params.orderId,
    buyerId: params.buyerId,
    coachId: item?.coach_id,
    orgId: item?.org_id,
    productName: item?.name || 'Marketplace item',
    amount: params.amount ?? toNumber(item?.price),
    currency: params.currency || 'usd',
  })
}
