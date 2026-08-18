import { NextResponse } from 'next/server'
import { createOrgOpportunityPaymentIntent } from '@/lib/publicOrgOpportunityPayments'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveRegistrationPrice } from '@/lib/registrationPricing'
import { checkYouthRegistration } from '@/lib/youthPrivacy'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const body = await request.json().catch(() => ({}))
  const athleteName = typeof body?.athlete_name === 'string' ? body.athlete_name.trim() : ''
  const youth=checkYouthRegistration(body?.date_of_birth)
  if(youth.error)return jsonError(youth.error)
  const guardianName=typeof body?.guardian_name==='string'?body.guardian_name.trim():''
  const guardianEmail=typeof body?.guardian_email==='string'?body.guardian_email.trim().toLowerCase():''
  if(youth.isUnder13&&(!guardianName||!guardianEmail.includes('@')||body?.coppa_consent_given!==true))return jsonError('Parent or guardian details and affirmative consent are required for players under 13',422)
  const athleteEmail = youth.isUnder13?guardianEmail:(typeof body?.athlete_email === 'string' ? body.athlete_email.trim().toLowerCase() : '')
  if (!athleteName) return jsonError('Athlete name is required')
  if (!athleteEmail || !athleteEmail.includes('@')) return jsonError('Valid athlete email is required')

  let { data: form, error } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('id, org_id, title, is_active, enrollment_fee_cents, early_bird_fee_cents, early_bird_deadline, late_fee_cents, late_fee_starts_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    const fallback = await supabaseAdmin
      .from('org_enrollment_forms')
      .select('id, org_id, title, is_active')
      .eq('slug', slug)
      .maybeSingle()
    form = fallback.data ? { ...fallback.data, enrollment_fee_cents: 0, early_bird_fee_cents: null, early_bird_deadline: null, late_fee_cents: null, late_fee_starts_at: null } : null
    error = fallback.error
  }

  if (error) return jsonError('Unable to load enrollment form', 500)
  if (!form) return jsonError('Enrollment form not found', 404)
  if (!(form as { is_active?: boolean }).is_active) {
    return jsonError('This enrollment form is no longer accepting applications', 410)
  }

  const { data: existing } = await supabaseAdmin
    .from('org_enrollment_submissions')
    .select('id')
    .eq('form_id', (form as { id: string }).id)
    .eq('athlete_email', athleteEmail)
    .maybeSingle()
  if (existing) return jsonError('An application with this email has already been submitted', 409)

  try {
    const pricing = resolveRegistrationPrice(form as any)
    const result = await createOrgOpportunityPaymentIntent({
      amountCents: pricing.amountCents,
      orgId: (form as { org_id: string }).org_id,
      source: 'enrollment_application',
      entityId: (form as { id: string }).id,
      title: (form as { title?: string | null }).title || 'Enrollment application',
      athleteName,
      athleteEmail,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start payment'
    return jsonError(message, 500)
  }
}
