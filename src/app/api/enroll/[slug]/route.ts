import { NextResponse } from 'next/server'
import { verifyOrgOpportunityPayment } from '@/lib/publicOrgOpportunityPayments'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveRegistrationPrice } from '@/lib/registrationPricing'
import { checkYouthRegistration } from '@/lib/youthPrivacy'
import { getPostHogClient } from '@/lib/posthog-server'
import { buildBrandedEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { createHash, randomUUID } from 'node:crypto'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { LEGAL_DOCUMENT_VERSIONS } from '@/lib/legalAgreements'

export const dynamic = 'force-dynamic'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

const escapeHtml = (value: unknown) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let { data, error } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('id, title, description, sport, age_group, is_active, org_id, enrollment_fee_cents, early_bird_fee_cents, early_bird_deadline, late_fee_cents, late_fee_starts_at, bundle_config, required_waiver_ids, required_documents, organizations(name)')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    const fallback = await supabaseAdmin
      .from('org_enrollment_forms')
      .select('id, title, description, sport, age_group, is_active, org_id, organizations(name)')
      .eq('slug', slug)
      .maybeSingle()
    data = fallback.data ? { ...fallback.data, enrollment_fee_cents: 0, early_bird_fee_cents: null, early_bird_deadline: null, late_fee_cents: null, late_fee_starts_at: null, bundle_config: {}, required_waiver_ids: [], required_documents: [] } : null
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

  const requiredWaiverIds = Array.isArray((form as any).required_waiver_ids)
    ? (form as any).required_waiver_ids.map(String)
    : []
  const { data: waiverRows } = requiredWaiverIds.length
    ? await supabaseAdmin
        .from('org_waivers')
        .select('id,title,body')
        .eq('org_id', form.org_id)
        .eq('is_active', true)
        .in('id', requiredWaiverIds)
    : { data: [] }
  const waivers = requiredWaiverIds
    .map((id: string) => (waiverRows || []).find((waiver) => waiver.id === id))
    .filter(Boolean)

  if (waivers.length !== requiredWaiverIds.length) {
    return jsonError('One or more required waivers are unavailable. Please contact the organization.', 409)
  }

  return NextResponse.json({
    form: {
      id: form.id,
      title: form.title,
      description: form.description,
      sport: form.sport,
      age_group: form.age_group,
      org_name: orgName,
      enrollment_fee_cents: form.enrollment_fee_cents ?? 0,
      ...resolveRegistrationPrice(form as any),
      early_bird_fee_cents: (form as any).early_bird_fee_cents ?? null,
      early_bird_deadline: (form as any).early_bird_deadline ?? null,
      late_fee_cents: (form as any).late_fee_cents ?? null,
      late_fee_starts_at: (form as any).late_fee_starts_at ?? null,
      bundle_config: (form as any).bundle_config || {},
      required_waiver_ids: requiredWaiverIds,
      waivers,
      required_documents: Array.isArray((form as any).required_documents) ? (form as any).required_documents : [],
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
    .select('id, org_id, title, is_active, enrollment_fee_cents, early_bird_fee_cents, early_bird_deadline, late_fee_cents, late_fee_starts_at, team_id, season_id, required_waiver_ids, required_documents, organizations(name)')
    .eq('slug', slug)
    .maybeSingle()

  if (formError) {
    const fallback = await supabaseAdmin
      .from('org_enrollment_forms')
      .select('id, org_id, title, is_active, team_id, season_id, organizations(name)')
      .eq('slug', slug)
      .maybeSingle()
    formRow = fallback.data ? { ...fallback.data, enrollment_fee_cents: 0, early_bird_fee_cents: null, early_bird_deadline: null, late_fee_cents: null, late_fee_starts_at: null, required_waiver_ids: [], required_documents: [] } : null
    formError = fallback.error
  }

  if (formError || !formRow) return jsonError('Enrollment form not found', 404)
  const form = formRow as { id: string; org_id: string; title?: string | null; is_active: boolean; enrollment_fee_cents?: number | null; team_id?: string | null; season_id?: string | null; required_waiver_ids?: string[]; required_documents?: Array<{ id?: string; required?: boolean }>; organizations?: { name?: string | null } | Array<{ name?: string | null }> | null }
  if (!form.is_active) return jsonError('This enrollment form is no longer accepting applications', 410)

  const body = await request.json().catch(() => ({}))
  const athleteName = typeof body?.athlete_name === 'string' ? body.athlete_name.trim() : ''
  const youth = checkYouthRegistration(body?.date_of_birth)
  if (youth.error) return jsonError(youth.error)
  const guardianName = typeof body?.guardian_name === 'string' ? body.guardian_name.trim() : ''
  const guardianEmail = typeof body?.guardian_email === 'string' ? body.guardian_email.trim().toLowerCase() : ''
  const coppaConsent = body?.coppa_consent_given === true
  if (youth.isMinor && (!guardianName || !guardianEmail.includes('@'))) return jsonError('Parent or guardian details are required for players under 18', 422)
  if (youth.isUnder13 && (!coppaConsent || body?.guardian_identity_confirmed !== true)) return jsonError('Parent or guardian consent is required for players under 13', 422)
  const submittedAthleteEmail = typeof body?.athlete_email === 'string' ? body.athlete_email.trim().toLowerCase() : ''
  const athleteEmail = youth.isMinor ? (submittedAthleteEmail || guardianEmail) : submittedAthleteEmail

  if (!athleteName) return jsonError('Athlete name is required')
  if (!athleteEmail || !athleteEmail.includes('@')) return jsonError('Valid athlete email is required')

  const requiredWaiverIds = Array.isArray(form.required_waiver_ids) ? form.required_waiver_ids.map(String) : []
  const signedWaiverIds = Array.isArray(body?.signed_waiver_ids)
    ? Array.from(new Set<string>(body.signed_waiver_ids.map(String)))
    : []
  const waiverSignerName = typeof body?.waiver_signer_name === 'string' ? body.waiver_signer_name.trim() : ''
  if (requiredWaiverIds.some((id) => !signedWaiverIds.includes(id))) {
    return jsonError('Every required waiver must be reviewed and accepted', 422)
  }
  if (requiredWaiverIds.length > 0 && !waiverSignerName) {
    return jsonError('The waiver signer full legal name is required', 422)
  }
  if (signedWaiverIds.some((id) => !requiredWaiverIds.includes(id))) {
    return jsonError('An invalid waiver acknowledgment was submitted', 422)
  }
  if (requiredWaiverIds.length > 0) {
    const { data: activeWaivers } = await supabaseAdmin
      .from('org_waivers')
      .select('id')
      .eq('org_id', form.org_id)
      .eq('is_active', true)
      .in('id', requiredWaiverIds)
    if ((activeWaivers || []).length !== requiredWaiverIds.length) {
      return jsonError('One or more required waivers are no longer available', 409)
    }
  }

  const requiredDocumentIds = (Array.isArray(form.required_documents) ? form.required_documents : [])
    .filter((item) => item?.required !== false).map((item) => String(item.id || '')).filter(Boolean)
  const submittedUploads = Array.isArray(body?.document_uploads) ? body.document_uploads : []
  const uploadIds = submittedUploads.map((item: any) => String(item?.id || '')).filter(Boolean)
  const { data: uploadRows } = uploadIds.length
    ? await supabaseAdmin.from('org_enrollment_document_uploads')
        .select('id,requirement_id,upload_token_hash').eq('form_id', form.id).is('submission_id', null).in('id', uploadIds)
    : { data: [] }
  const validUploads = (uploadRows || []).filter((row) => {
    const claimed = submittedUploads.find((item: any) => String(item?.id) === row.id)
    return claimed?.token && createHash('sha256').update(String(claimed.token)).digest('hex') === row.upload_token_hash
  })
  if (requiredDocumentIds.some((id) => !validUploads.some((row) => row.requirement_id === id))) {
    return jsonError('Upload every required registration document before continuing', 422)
  }

  // Rate-limit: one submission per email per form
  const { data: existing } = await supabaseAdmin
    .from('org_enrollment_submissions')
    .select('id')
    .eq('form_id', form.id)
    .eq('athlete_email', athleteEmail)
    .maybeSingle()
  if (existing) return jsonError('An application with this email has already been submitted', 409)

  const { amountCents: enrollmentFeeCents, pricingPhase: resolvedPricingPhase } = resolveRegistrationPrice(form as any)
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
        amount_cents: payment.intent.amount,
        platform_fee_cents: payment.platformFeeCents,
        net_amount_cents: Math.max(payment.intent.amount - payment.platformFeeCents, 0),
        payment_method_brand: payment.paymentMethodBrand,
        payment_method_last4: payment.paymentMethodLast4,
      },
    }).select('id').maybeSingle()
    receiptId = (receipt as { id?: string } | null)?.id || null
  }

  const submissionPayload = {
    form_id: form.id,
    org_id: form.org_id,
    athlete_name: athleteName,
    athlete_email: athleteEmail,
    guardian_name: guardianName || null,
    guardian_email: guardianEmail || null,
    guardian_phone: body?.guardian_phone?.trim() || null,
    date_of_birth: body?.date_of_birth || null,
    notes: body?.notes?.trim() || null,
    status: youth.isMinor ? 'pending_guardian_approval' : 'pending',
    signed_waiver_ids: signedWaiverIds,
    waiver_signed_at: signedWaiverIds.length ? new Date().toISOString() : null,
    waiver_signer_name: waiverSignerName || null,
    amount_due_cents: enrollmentFeeCents,
    registration_source: ['direct_link','referral','in_app'].includes(String(body?.registration_source)) ? body.registration_source : 'direct_link',
    pricing_phase: resolvedPricingPhase,
    coppa_consent_given: youth.isUnder13 && coppaConsent,
    coppa_consent_date: youth.isUnder13 && coppaConsent ? new Date().toISOString() : null,
    coppa_consenting_guardian_name: youth.isUnder13 && coppaConsent ? guardianName : null,
    coppa_consenting_guardian_email: youth.isUnder13 && coppaConsent ? guardianEmail : null,
    coppa_guardian_identity_confirmed: youth.isUnder13 && body?.guardian_identity_confirmed === true,
    coppa_notice_version: youth.isUnder13 ? LEGAL_DOCUMENT_VERSIONS.children_privacy_notice : null,
    coppa_consent_method: youth.isUnder13 ? 'affirmative_clickwrap' : null,
    coppa_confirmation_text: youth.isUnder13 ? {
      identity: 'I confirm that I am this athlete’s parent or legal guardian and am authorized to provide this consent.',
      privacy_consent: 'I have reviewed the Children’s Privacy Notice and consent to Coaches Hive collecting, using, and disclosing my athlete’s information as described in that notice.',
    } : null,
    coppa_consent_ip: youth.isUnder13 ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null : null,
    coppa_consent_user_agent: youth.isUnder13 ? request.headers.get('user-agent') : null,
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

  if (validUploads.length > 0) {
    await supabaseAdmin.from('org_enrollment_document_uploads')
      .update({ submission_id: (data as { id: string }).id })
      .in('id', validUploads.map((row) => row.id))
  }

  if (youth.isMinor) {
    await supabaseAdmin.from('guardian_registration_approvals').insert({
      submission_id: (data as { id: string }).id,
      guardian_name: guardianName,
      guardian_email: guardianEmail,
      status: 'pending',
    })
  }

  getPostHogClient().capture({ distinctId: `registration:${(data as { id:string }).id}`, event: 'registration_completed', properties: {
    org_id: form.org_id, player_id: null, registration_source: submissionPayload.registration_source,
  } })

  if (payment && data) {
    // The unified ledger is additive. Legacy receipt/submission records remain the
    // source for existing screens while new payment reporting reads one cents-based table.
    const requestedFamilyAccountId = typeof body?.family_account_id === 'string' ? body.family_account_id : null
    const requestedPlayerId = typeof body?.player_id === 'string' ? body.player_id : null
    const guardianEmail = typeof body?.guardian_email === 'string' ? body.guardian_email.trim().toLowerCase() : null
    const [{ data: familyProfile }, { data: playerProfile }] = await Promise.all([
      requestedFamilyAccountId && guardianEmail
        ? supabaseAdmin.from('profiles').select('id').eq('id', requestedFamilyAccountId).ilike('email', guardianEmail).maybeSingle()
        : Promise.resolve({ data: null }),
      requestedPlayerId
        ? supabaseAdmin.from('profiles').select('id').eq('id', requestedPlayerId).ilike('email', athleteEmail).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const familyAccountId = familyProfile?.id || null
    const playerId = playerProfile?.id || null
    const pricingPhase = ['early_bird', 'standard', 'late'].includes(String(body?.pricing_phase))
      ? String(body.pricing_phase)
      : resolvedPricingPhase
    const registrationSource = ['direct_link', 'referral', 'in_app'].includes(String(body?.registration_source))
      ? String(body.registration_source)
      : 'direct_link'

    await supabaseAdmin.from('payment_transactions').upsert({
      transaction_type: 'registration',
      status: 'succeeded',
      org_id: form.org_id,
      payer_id: familyAccountId,
      player_id: playerId,
      team_id: form.team_id || null,
      season_id: form.season_id || null,
      source_record_type: 'org_enrollment_submission',
      source_record_id: (data as { id: string }).id,
      description: form.title || 'Enrollment application',
      gross_amount_cents: payment.intent.amount,
      platform_fee_cents: payment.platformFeeCents,
      processing_fee_rate: payment.feeRate / 100,
      net_amount_cents: Math.max(payment.intent.amount - payment.platformFeeCents, 0),
      currency: 'usd',
      stripe_payment_intent_id: payment.intent.id,
      stripe_charge_id: payment.chargeId,
      payment_method_brand: payment.paymentMethodBrand,
      payment_method_last4: payment.paymentMethodLast4,
      occurred_at: new Date(payment.intent.created * 1000).toISOString(),
      metadata: {
        pricing_phase: pricingPhase,
        registration_source: registrationSource,
        receipt_id: receiptId,
        athlete_name: athleteName,
        athlete_email: athleteEmail,
      },
    }, { onConflict: 'stripe_payment_intent_id' })

    const analytics=getPostHogClient()
    analytics.capture({distinctId:familyAccountId||`registration:${(data as { id:string }).id}`,event:'payment_processed',properties:{org_id:form.org_id,transaction_type:'registration',amount_cents:payment.intent.amount,is_first_payment:false}})
    analytics.capture({distinctId:form.org_id,event:'platform_fee_earned',properties:{org_id:form.org_id,transaction_type:'registration',fee_amount_cents:payment.platformFeeCents}})

    if (playerId && form.team_id) {
      await supabaseAdmin.from('org_team_members').upsert({
        team_id: form.team_id,
        athlete_id: playerId,
      }, { onConflict: 'team_id,athlete_id', ignoreDuplicates: true })
    }
  }

  const orgName = Array.isArray(form.organizations)
    ? form.organizations[0]?.name || 'the organization'
    : form.organizations?.name || 'the organization'
  const confirmationEmail = guardianEmail || athleteEmail
  const confirmationName = guardianName || athleteName
  const amountLabel = enrollmentFeeCents > 0 ? `$${(enrollmentFeeCents / 100).toFixed(2)}` : 'Free'
  const accessToken = randomUUID()
  await supabaseAdmin.from('registration_access_tokens').insert({
    email: confirmationEmail,
    token_hash: createHash('sha256').update(accessToken).digest('hex'),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  })
  const accessUrl = `${resolveBaseUrl()}/registrations/access?token=${encodeURIComponent(accessToken)}`
  const emailResult = await sendTransactionalEmail({
    toEmail: confirmationEmail,
    toName: confirmationName,
    subject: `Registration received — ${form.title || 'program registration'}`,
    tag: 'registration_confirmation',
    htmlBody: buildBrandedEmailHtml(`
      <p>Hi ${escapeHtml(confirmationName)},</p>
      <p>Your registration has been received by <strong>${escapeHtml(orgName)}</strong>.</p>
      <p><strong>Program:</strong> ${escapeHtml(form.title || 'Program registration')}<br/>
      <strong>Athlete:</strong> ${escapeHtml(athleteName)}<br/>
      <strong>Amount:</strong> ${escapeHtml(amountLabel)}<br/>
      <strong>Confirmation:</strong> ${escapeHtml((data as { id: string }).id)}</p>
      <p>The organization will contact you if any additional information is needed.</p>
      ${youth.isMinor ? '<p><strong>Guardian action required:</strong> open the secure link below to approve this registration.</p>' : ''}
    `, accessUrl),
    textBody: `Registration received by ${orgName}. Program: ${form.title || 'Program registration'}. Athlete: ${athleteName}. Amount: ${amountLabel}. Confirmation: ${(data as { id: string }).id}. Manage registration: ${accessUrl}`,
    metadata: { registration_id: (data as { id: string }).id, org_id: form.org_id },
  })

  return NextResponse.json({ ok: true, id: (data as { id: string }).id, confirmation_email: emailResult.status })
}
