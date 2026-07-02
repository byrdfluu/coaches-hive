import { NextResponse } from 'next/server'
import {
  ORG_BASE_FEE_RANGE,
  ORG_SESSION_FEES,
  ORG_MARKETPLACE_FEE,
} from '@/lib/orgPricing'
import { getFeeSettings } from '@/lib/orgPlatformFees'

export async function GET() {
  const feeSettings = await getFeeSettings()
  return NextResponse.json({
    base_fee_range: ORG_BASE_FEE_RANGE,
    session_fees: ORG_SESSION_FEES,
    session_fee_tiers: feeSettings.orgSessionRollingVolumeTiers,
    session_fee_volume_window_days: feeSettings.orgSessionRollingVolumeWindowDays,
    marketplace_fee: ORG_MARKETPLACE_FEE,
    marketplace_fee_cap_cents: feeSettings.marketplacePlatformFeeCapCents,
    stripe_processing_fee_percent: feeSettings.stripeProcessingFeePercent,
    stripe_processing_fee_fixed_cents: feeSettings.stripeProcessingFeeFixedCents,
  })
}
