import { NextResponse } from 'next/server'
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

  const { data, error } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('id, title, description, sport, age_group, is_active, org_id, organizations(name)')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) return jsonError('Enrollment form not found', 404)
  type FormRow = {
    id: string; title: string; description: string | null; sport: string | null;
    age_group: string | null; is_active: boolean; org_id: string;
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
    },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const { data: formRow, error: formError } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('id, org_id, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (formError || !formRow) return jsonError('Enrollment form not found', 404)
  const form = formRow as { id: string; org_id: string; is_active: boolean }
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

  const { data, error: insertError } = await supabaseAdmin
    .from('org_enrollment_submissions')
    .insert({
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
    })
    .select('id')
    .single()

  if (insertError) return jsonError('Failed to submit application', 500)
  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}
