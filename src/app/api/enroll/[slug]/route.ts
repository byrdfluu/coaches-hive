import { NextResponse } from 'next/server'
import { verifyOrgOpportunityPayment } from '@/lib/publicOrgOpportunityPayments'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let { data, error } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('id, title, description, sport, age_group, is_active, org_id, enrollment_fee_cents, organizations(name)')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    const fallback = await supabaseAdmin
      .from('org_enrollment_forms')
      .select('id, title, description, sport, age_group, is_active, org_id, organizations(name)')
      .eq('slug', slug)
      .maybeSingle()
    data = fallback.data ? { ...fallback.data, enrollment_fee_cents: 0 } : null
    error = fallback.error
  }

  if (error || !data) return jsonError('Enrollment form not found', 404)
  type FormRow = {
    id: string; title: string; description: string | null; sport: string | null;
    age_group: string | null; is_active: boolean; org_id: string; enrollment_fee_cents?: number | null;
    organizations: { name: string }[] | { name: string } | null
  }
  const form = data as unknown as FormRow
  if (!form.is_active) return jsonError('This enrollment form is no longer accepting applications', 410)

  const orgName = Array.isArray(form.organizations)
    ? (form.organizations[0]?.name ?? null)
    : (form.organizations?.name ?? null)

  return NextResponse.json({
    form: {
      id: form.id,
      title: form.title,
      description: form.description,
      sport: form.sport,
      age_group: form.age_group,
      org_name: orgName,
      enrollment_fee_cents: form.enrollment_fee_cents ?? 0,
    },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let { data: formRow, error: formError } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('id, org_id, title, is_active, enrollment_fee_cents')
    .eq('slug', slug)
    .maybeSingle()

  if (formError) {
    const fallback = await supabaseAdmin
      .from('org_enrollment_forms')
      .select('id, org_id, title, is_active')
      .eq('slug', slug)
      .maybeSingle()
    formRow = fallback.data ? { ...fallback.data, enrollment_fee_cents: 0 } : null
    formError = fallback.error
  }

  if (formError || !formRow) return jsonError('Enrollment form not found', 404)
  const form = formRow as { id: string; org_id: string; title?: string | null; is_active: boolean; enrollment_fee_cents?: number | null }
  if (!form.is_active) return jsonError('This enrollment form is no longer accepting applications', 410)

  const body = await request.json().catch(() => ({}))
  const athleteName = typeof body?.athlete_name === 'string' ? body.athlete_name.trim() : ''
  const athleteEmail = typeof body?.athlete_email === 'string' ? body.athlete_email.trim().toLowerCase() : ''

  if (!athleteName) return jsonError('Athlete name is required')
  if (!athleteEmail || !athleteEmail.includes('@')) return jsonError('Valid athlete email is required')

  // Rate-limit: one submission per email per form
  const { data: existing } = await supabaseAdmin
    .from('org_enrollment_submissions')
    .select('id')
    .eq('form_id', form.id)
    .eq('athlete_email', athleteEmail)
    .maybeSingle()
  if (existing) return jsonError('An application with this email has already been submitted', 409)

  const enrollmentFeeCents = form.enrollment_fee_cents ?? 0
  const paymentIntentId = typeof body?.payment_intent_id === 'string' ? body.payment_intent_id.trim() : ''
  let payment: Awaited<ReturnType<typeof verifyOrgOpportunityPayment>> | null = null
  if (enrollmentFeeCents > 0) {
    if (!paymentIntentId) return jsonError('Payment is required for this enrollment application', 402)
    try {
      payment = await verifyOrgOpportunityPayment({
        paymentIntentId,
        expectedAmountCents: enrollmentFeeCents,
        orgId: form.org_id,
        source: 'enrollment_application',
        entityId: form.id,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to verify enrollment payment'
      return jsonError(message, 409)
    }

    const { data: usedPayment } = await supabaseAdmin
      .from('org_enrollment_submissions')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()
    if (usedPayment) return jsonError('This payment has already been used for an enrollment application', 409)
  }

  let receiptId: string | null = null
  if (payment) {
    const { data: receipt } = await supabaseAdmin.from('payment_receipts').insert({
      org_id: form.org_id,
      amount: payment.amount,
      currency: 'usd',
      status: 'paid',
      stripe_payment_intent_id: payment.intent.id,
      stripe_charge_id: payment.chargeId,
      metadata: {
        source: 'enrollment_application',
        enrollment_form_id: form.id,
        enrollment_form_title: form.title || null,
        athlete_name: athleteName,
        athlete_email: athleteEmail,
        platform_fee: payment.platformFee,
        platform_fee_rate: payment.feeRate,
        net_amount: payment.netAmount,
        gross_amount: payment.amount,
        org_tier: payment.orgTier,
      },
    }).select('id').maybeSingle()
    receiptId = (receipt as { id?: string } | null)?.id || null
  }

  const submissionPayload = {
    form_id: form.id,
    org_id: form.org_id,
    athlete_name: athleteName,
    athlete_email: athleteEmail,
    guardian_name: body?.guardian_name?.trim() || null,
    guardian_email: body?.guardian_email?.trim()?.toLowerCase() || null,
    guardian_phone: body?.guardian_phone?.trim() || null,
    date_of_birth: body?.date_of_birth || null,
    notes: body?.notes?.trim() || null,
    status: 'pending',
  }

  let { data, error: insertError } = await supabaseAdmin
    .from('org_enrollment_submissions')
    .insert({
      ...submissionPayload,
      payment_status: enrollmentFeeCents > 0 ? 'paid' : 'unpaid',
      stripe_payment_intent_id: payment?.intent.id || null,
      payment_receipt_id: receiptId,
      paid_at: payment ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (insertError && !payment) {
    const fallback = await supabaseAdmin
      .from('org_enrollment_submissions')
      .insert(submissionPayload)
      .select('id')
      .single()
    data = fallback.data
    insertError = fallback.error
  }

  if (insertError) return jsonError('Failed to submit application', 500)
  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}
