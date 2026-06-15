import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ATHLETE_ROLES = ['athlete']

export async function GET() {
  const { session, error } = await getSessionRole(ATHLETE_ROLES)
  if (error) return error

  const email = session.user.email?.trim().toLowerCase()
  if (!email) return jsonError('Athlete email not found', 404)

  const [{ data: registrations }, { data: submissions }] = await Promise.all([
    supabaseAdmin
      .from('tryout_registrations')
      .select('id, tryout_event_id, athlete_name, payment_status, created_at')
      .eq('athlete_email', email)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('org_enrollment_submissions')
      .select('id, form_id, athlete_name, status, created_at')
      .eq('athlete_email', email)
      .order('created_at', { ascending: false }),
  ])

  const tryoutIds = Array.from(new Set((registrations || []).map((row: { tryout_event_id?: string | null }) => row.tryout_event_id).filter(Boolean))) as string[]
  const formIds = Array.from(new Set((submissions || []).map((row: { form_id?: string | null }) => row.form_id).filter(Boolean))) as string[]

  const [{ data: tryoutRows }, { data: formRows }] = await Promise.all([
    tryoutIds.length
      ? supabaseAdmin
          .from('tryout_events')
          .select('id, org_id, name, event_date, status')
          .in('id', tryoutIds)
      : Promise.resolve({ data: [] }),
    formIds.length
      ? supabaseAdmin
          .from('org_enrollment_forms')
          .select('id, org_id, title, slug')
          .in('id', formIds)
      : Promise.resolve({ data: [] }),
  ])

  const orgIds = Array.from(new Set([
    ...(tryoutRows || []).map((row: { org_id?: string | null }) => row.org_id).filter(Boolean),
    ...(formRows || []).map((row: { org_id?: string | null }) => row.org_id).filter(Boolean),
  ])) as string[]

  const { data: orgRows } = orgIds.length
    ? await supabaseAdmin.from('organizations').select('id, name').in('id', orgIds)
    : { data: [] }

  const orgMap = new Map((orgRows || []).map((row: { id: string; name?: string | null }) => [row.id, row.name || 'Organization'] as const))
  const tryoutMap = new Map((tryoutRows || []).map((row: { id: string }) => [row.id, row] as const))
  const formMap = new Map((formRows || []).map((row: { id: string }) => [row.id, row] as const))

  return NextResponse.json({
    tryoutRegistrations: (registrations || []).map((registration: {
      id: string
      tryout_event_id?: string | null
      payment_status?: string | null
      created_at?: string | null
    }) => {
      const tryout = registration.tryout_event_id ? tryoutMap.get(registration.tryout_event_id) as {
        id: string
        org_id?: string | null
        name?: string | null
        event_date?: string | null
        status?: string | null
      } | undefined : undefined
      return {
        id: registration.id,
        title: tryout?.name || 'Tryout',
        org_name: tryout?.org_id ? orgMap.get(tryout.org_id) : 'Organization',
        event_date: tryout?.event_date || null,
        status: tryout?.status || 'registered',
        payment_status: registration.payment_status || 'unpaid',
        href: tryout?.id ? `/tryouts/${tryout.id}` : null,
      }
    }),
    enrollmentApplications: (submissions || []).map((submission: {
      id: string
      form_id?: string | null
      status?: string | null
      created_at?: string | null
    }) => {
      const form = submission.form_id ? formMap.get(submission.form_id) as {
        org_id?: string | null
        title?: string | null
        slug?: string | null
      } | undefined : undefined
      return {
        id: submission.id,
        title: form?.title || 'Enrollment application',
        org_name: form?.org_id ? orgMap.get(form.org_id) : 'Organization',
        status: submission.status || 'pending',
        href: form?.slug ? `/enroll/${form.slug}` : null,
      }
    }),
  })
}
