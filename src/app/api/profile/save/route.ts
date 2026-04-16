import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { selectProfileCompat, upsertProfileCompat } from '@/lib/profileSchemaCompat'
import { getPrimaryAthleteProfile, upsertPrimaryAthleteProfile } from '@/lib/athleteProfiles'

export const dynamic = 'force-dynamic'

// Columns the client is allowed to set on their own profile row.
// Never expose columns that could affect auth, roles, or other users.
const ACCOUNT_PROFILE_COLUMNS = [
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
  'guardian_name',
  'guardian_email',
  'guardian_phone',
  'guardian_approval_rule',
  'account_owner_type',
  'shipping_address_line1',
  'shipping_city',
  'shipping_state',
  'shipping_zip',
  'shipping_country',
] as const

const ATHLETE_PROFILE_COLUMNS = [
  'full_name',
  'bio',
  'avatar_url',
  'athlete_birthdate',
  'athlete_season',
  'athlete_grade_level',
  'athlete_sport',
  'athlete_location',
] as const

const ALLOWED_COLUMNS = [
  ...ACCOUNT_PROFILE_COLUMNS,
  ...ATHLETE_PROFILE_COLUMNS,
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

  if (typeof updates.guardian_email === 'string') {
    updates.guardian_email = updates.guardian_email.trim().toLowerCase() || null
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

  const accountUpdates: Record<string, unknown> = { id: userId }
  for (const key of ACCOUNT_PROFILE_COLUMNS) {
    if (key in updates) accountUpdates[key] = updates[key]
  }
  const athleteProfileInput = {
    full_name: typeof updates.full_name === 'string' ? updates.full_name.trim() : undefined,
    avatar_url: typeof updates.avatar_url === 'string' ? updates.avatar_url : updates.avatar_url === null ? null : undefined,
    bio: typeof updates.bio === 'string' ? updates.bio : updates.bio === null ? null : undefined,
    sport: typeof updates.athlete_sport === 'string' ? updates.athlete_sport : updates.athlete_sport === null ? null : undefined,
    location: typeof updates.athlete_location === 'string' ? updates.athlete_location : updates.athlete_location === null ? null : undefined,
    season: typeof updates.athlete_season === 'string' ? updates.athlete_season : updates.athlete_season === null ? null : undefined,
    grade_level: typeof updates.athlete_grade_level === 'string' ? updates.athlete_grade_level : updates.athlete_grade_level === null ? null : undefined,
    birthdate: typeof updates.athlete_birthdate === 'string' ? updates.athlete_birthdate : updates.athlete_birthdate === null ? null : undefined,
  }

  const accountWritePromise =
    Object.keys(accountUpdates).length > 1
      ? upsertProfileCompat({
          supabase: supabaseAdmin,
          payload: accountUpdates,
        })
      : Promise.resolve({ error: null, removedColumns: [] as string[] })

  const athleteProfileWritePromise =
    Object.values(athleteProfileInput).some((value) => value !== undefined)
      ? upsertPrimaryAthleteProfile({
          supabase: supabaseAdmin,
          ownerUserId: userId,
          updates: athleteProfileInput,
        })
      : getPrimaryAthleteProfile({
          supabase: supabaseAdmin,
          ownerUserId: userId,
        })

  const [{ error, removedColumns }, athleteProfileWrite] = await Promise.all([
    accountWritePromise,
    athleteProfileWritePromise,
  ])

  if (error || athleteProfileWrite?.error) {
    console.error('[profile/save] upsert error:', error?.message, error?.code)
    trackServerFlowFailure((error || athleteProfileWrite?.error) as Error, {
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
    columns: Array.from(
      new Set([
        'id',
        ...Object.keys(accountUpdates).filter((key) => key !== 'id'),
        'updated_at',
      ]),
    ),
  })

  const accountData = (data || {}) as Record<string, unknown>
  const athleteProfileData = athleteProfileWrite?.data || null
  const mergedProfile = {
    ...accountData,
    ...(athleteProfileData
      ? {
          full_name: athleteProfileData.full_name,
          avatar_url: athleteProfileData.avatar_url,
          bio: athleteProfileData.bio,
          athlete_sport: athleteProfileData.sport,
          athlete_location: athleteProfileData.location,
          athlete_season: athleteProfileData.season,
          athlete_grade_level: athleteProfileData.grade_level,
          athlete_birthdate: athleteProfileData.birthdate,
        }
      : {}),
  }

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

  if (typeof updates.full_name === 'string' && updates.full_name.trim()) {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: updates.full_name.trim(), name: updates.full_name.trim() },
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, profile: mergedProfile })
}
