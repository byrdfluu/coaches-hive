import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildBrandedEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { isPushEnabled } from '@/lib/notificationPrefs'
import { getSessionRoleState } from '@/lib/sessionRoleState'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return jsonError('Unauthorized', 401)

  const role = getSessionRoleState(session.user.user_metadata).currentRole

  if (!role || !['coach', 'assistant_coach', 'admin'].includes(role)) {
    return jsonError('Forbidden', 403)
  }

  const body = await request.json().catch(() => ({}))
  const { athletes } = body || {}

  if (!Array.isArray(athletes) || athletes.length === 0) {
    return jsonError('athletes array is required')
  }

  if (athletes.length > 200) {
    return jsonError('Maximum 200 athletes per batch')
  }

  const coachId =
    role === 'admin' && typeof body?.coach_id === 'string' && body.coach_id.trim()
      ? body.coach_id.trim()
      : session.user.id

  const { data: coachProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', coachId)
    .maybeSingle()

  // Normalize rows
  const normalizedAthletes = (athletes as Array<{ email?: string; name?: string; sport?: string }>)
    .map((a) => ({
      email: String(a.email || '').trim().toLowerCase(),
      name: String(a.name || '').trim(),
      sport: String(a.sport || '').trim(),
    }))
    .filter((a) => a.email && a.email.includes('@') && a.email.includes('.'))

  if (normalizedAthletes.length === 0) {
    return jsonError('No valid email addresses found')
  }

  const emails = normalizedAthletes.map((a) => a.email)

  const { data: existingProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, notification_prefs')
    .in('email', emails)

  const profileMap = new Map(
    (existingProfiles || []).map((p) => [p.email as string, p]),
  )

  const results = {
    linked: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
    skipped_emails: [] as string[],
    failed_emails: [] as string[],
  }

  await Promise.allSettled(
    normalizedAthletes.map(async (a) => {
      const athleteProfile = profileMap.get(a.email)

      if (athleteProfile) {
        const athleteRole = String(athleteProfile.role || '').toLowerCase()
        if (athleteRole && athleteRole !== 'athlete') {
          results.skipped++
          results.skipped_emails.push(a.email)
          return
        }

        const { data: linkRow, error: linkError } = await supabaseAdmin
          .from('coach_athlete_links')
          .upsert(
            { coach_id: coachId, athlete_id: athleteProfile.id, status: 'active' },
            { onConflict: 'coach_id,athlete_id' },
          )
          .select('id')
          .single()

        if (linkError || !linkRow) {
          results.failed++
          results.failed_emails.push(a.email)
          return
        }

        if (isPushEnabled(athleteProfile.notification_prefs, 'messages')) {
          await supabaseAdmin
            .from('notifications')
            .insert({
              user_id: athleteProfile.id,
              type: 'coach_invite',
              title: 'Coach invitation',
              body: `${coachProfile?.full_name || 'A coach'} invited you to connect.`,
              action_url: '/athlete/discover',
              data: {
                category: 'Messages',
                coach_id: coachId,
                coach_name: coachProfile?.full_name || null,
                source: 'coach_athletes_bulk_import',
              },
            })
        }

        results.linked++
        return
      }

      // Not on platform — send invite email directly
      const bulkSignupUrl = `https://coacheshive.com/signup?role=athlete&email=${encodeURIComponent(a.email)}`
      await sendTransactionalEmail({
        toEmail: a.email,
        toName: a.name || null,
        subject: `${coachProfile?.full_name || 'A coach'} invited you to Coaches Hive`,
        htmlBody: buildBrandedEmailHtml(
          `<p><strong>${coachProfile?.full_name || 'A coach'}</strong> invited you to connect on Coaches Hive.</p><p style="color:#4a4a4a;">Create your free account to accept the invite and get started.</p>`,
          bulkSignupUrl,
          'Create your account →',
        ),
        textBody: `${coachProfile?.full_name || 'A coach'} invited you to connect on Coaches Hive. Create your account to get started: ${bulkSignupUrl}`,
        tag: 'coach_invite_athlete',
        metadata: {
          coach_id: coachId,
          coach_name: coachProfile?.full_name || null,
          invite_type: 'athlete',
          invite_name: a.name || null,
          invite_sport: a.sport || null,
          source: 'bulk_import',
        },
      }).catch(() => null)

      results.queued++
    }),
  )

  return NextResponse.json(results)
}
