import { NextResponse } from 'next/server'
import {
  ORG_BASE_FEE_RANGE,
  ORG_SESSION_FEES,
  ORG_MARKETPLACE_FEE,
} from '@/lib/orgPricing'

export async function GET() {
  return NextResponse.json({
    base_fee_range: ORG_BASE_FEE_RANGE,
    session_fees: ORG_SESSION_FEES,
    marketplace_fee: ORG_MARKETPLACE_FEE,
  })
}
