import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type ProcessingResponsibility = 'platform_absorbs_processing' | 'org_pays_processing'

export async function loadOrgCommercialTerms(orgId: string) {
  const { data, error } = await supabaseAdmin.from('organizations')
    .select('platform_fee_rate,payment_processing_responsibility,complimentary_subscription_until')
    .eq('id', orgId).maybeSingle()
  if (error || !data) throw new Error('Unable to resolve organization commercial terms')
  const platformFeeRate = Number(data.platform_fee_rate)
  if (!Number.isFinite(platformFeeRate) || platformFeeRate < 0 || platformFeeRate > 0.1) throw new Error('Organization platform fee rate is invalid')
  const processingResponsibility = String(data.payment_processing_responsibility) as ProcessingResponsibility
  if (!['platform_absorbs_processing', 'org_pays_processing'].includes(processingResponsibility)) throw new Error('Organization processing fee responsibility is invalid')
  return { platformFeeRate, processingResponsibility, complimentarySubscriptionUntil: data.complimentary_subscription_until as string | null }
}
