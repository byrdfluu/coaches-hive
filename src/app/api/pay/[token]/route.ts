import { NextResponse } from 'next/server'
import { createPublicPaymentCheckout, getPublicPaymentLink, paymentLinkError } from '@/lib/staffFeePaymentLinks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const view = await getPublicPaymentLink((await params).token, request, true)
  if (!view) return paymentLinkError('expired_or_revoked_link','This payment link is expired, revoked, or unavailable.',410)
  return NextResponse.json({
    owner_type:view.assignment.ownerType,
    organization_name:view.workspace?.display_name || (view.assignment.ownerType==='organization'?'Organization':'League'),
    logo_url:view.logoUrl,
    athlete:view.verified?view.athleteName:null,
    payer_verified:view.verified,
    fee_description:view.assignment.title,
    base_amount_cents:view.contract.base_amount_cents,
    service_fee_cents:view.contract.service_fee_cents,
    total_cents:view.contract.total_cents,
    service_fee_label:'Service fee (non-refundable)',
    due_at:view.assignment.dueAt,
    payment_status:view.assignment.status,
    expires_at:view.link.expires_at,
    cancellation_terms:'Contact the organization or league for cancellation eligibility.',
    refund_terms:'Service fees are non-refundable. Other refunds follow the provider’s published policy.',
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return createPublicPaymentCheckout((await params).token, request)
}
