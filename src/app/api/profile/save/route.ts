import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { selectProfileCompat, upsertProfileCompat } from '@/lib/profileSchemaCompat'

export const dynamic = 'force-dynamic'

// Columns the client is allowed to set on their own profile row.
// Never expose columns that could affect auth, roles, or other users.
const ALLOWED_COLUMNS = [
  'full_name',
  'bio',
  'certifications',
  'coach_seasons',
  'coach_grades',
  'coach_profile_settings',
  'coach_security_settings',
  'coach_privacy_settings',
  'coach_cancel_window',
  'coach_reschedule_window',
  'coach_refund_policy',
  'coach_messaging_hours',
  'coach_auto_reply',
  'coach_silence_outside_hours',
  'notification_prefs',
  'integration_settings',
  'athlete_privacy_settings',
  'athlete_communication_settings',
  'calendar_feed_token',
  'brand_logo_url',
  'brand_cover_url',
  'brand_primary_color',
  'brand_accent_color',
  'avatar_url',
  // athlete-specific
  'athlete_birthdate',
  'athlete_season',
  'athlete_grade_level',
  'athlete_sport',
  'athlete_location',
  'guardian_name',
  'guardian_email',
  'guardian_phone',
  'guardian_approval_rule',
  'account_owner_type',
] as const

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig) {
    trackServerFlowEvent({
      flow: 'profile_save',
      step: 'config_check',
      status: 'failed',
      metadata: { reason: 'missing_supabase_admin_config' },
    })
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { session, error: authError } = await getSessionRole()
  if (authError || !session) {
    trackServerFlowEvent({
      flow: 'profile_save',
      step: 'auth',
      status: 'failed',
      metadata: { reason: 'unauthorized' },
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const userId = session.user.id
  const sessionRole = getSessionRoleState(session.user.user_metadata).currentRole

  // Build update payload from whitelisted keys only
  const updates: Record<string, unknown> = { id: userId }
  for (const key of ALLOWED_COLUMNS) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 1) {
    trackServerFlowEvent({
      flow: 'profile_save',
      step: 'validate',
      status: 'failed',
      userId,
      role: sessionRole,
      metadata: { reason: 'no_allowed_fields' },
    })
    return NextResponse.json({ error: 'No valid profile fields were provided.' }, { status: 400 })
  }

  trackServerFlowEvent({
    flow: 'profile_save',
    step: 'write',
    status: 'started',
    userId,
    role: sessionRole,
    metadata: {
      keys: Object.keys(updates).filter((key) => key !== 'id'),
    },
  })

  const { error, removedColumns } = await upsertProfileCompat({
    supabase: supabaseAdmin,
    payload: updates,
  })

  if (error) {
    console.error('[profile/save] upsert error:', error?.message, error?.code)
    trackServerFlowFailure(error, {
      flow: 'profile_save',
      step: 'write',
      userId,
      role: sessionRole,
      entityId: userId,
      metadata: {
        keys: Object.keys(updates).filter((key) => key !== 'id'),
      },
    })
    return NextResponse.json({ error: error?.message || 'Unable to save profile' }, { status: 500 })
  }

  const requestedColumns: string[] = Object.keys(updates).filter((key: string) => key !== 'id')
  const droppedColumns = (removedColumns || []).filter((column: string) => requestedColumns.includes(column))
  if (droppedColumns.length > 0) {
    const message = `Profile fields are unavailable in the database: ${droppedColumns.join(', ')}`
    trackServerFlowFailure(new Error(message), {
      flow: 'profile_save',
      step: 'schema_validation',
      userId,
      role: sessionRole,
      entityId: userId,
      metadata: { droppedColumns },
    })
    return NextResponse.json(
      {
        error: 'Main athlete profile fields are missing from the database schema.',
        missing_columns: droppedColumns,
      },
      { status: 500 },
    )
  }

  const { data } = await selectProfileCompat({
    supabase: supabaseAdmin,
    userId,
    columns: Array.from(new Set(['id', ...Object.keys(updates).filter((key) => key !== 'id'), 'updated_at'])),
  })

  trackServerFlowEvent({
    flow: 'profile_save',
    step: 'write',
    status: 'succeeded',
    userId,
    role: sessionRole,
    entityId: userId,
    metadata: {
      keys: Object.keys(updates).filter((key) => key !== 'id'),
    },
  })

  return NextResponse.json({ ok: true, profile: data })
}
