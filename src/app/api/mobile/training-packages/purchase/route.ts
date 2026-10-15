import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileApiError } from '@/lib/mobileApiContract'
import { requestIdFor } from '@/lib/requestSecurity'
import { parseUuid } from '@/lib/uuid'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { LEGACY_TRAINING_PURCHASE_DISABLED, legacyTrainingMigration, legacyTrainingRedirect } from '@/lib/legacyTrainingMigration'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const user = await getMobileRequestUser(request)
  if (!user) return mobileApiError({ code: 'unauthorized', message: 'Authentication is required.', status: 401, retryable: false, requestId })
  const body = await request.json().catch(() => ({}))
  const packageId = parseUuid(body.package_id || body.offering_id)
  const athleteId = parseUuid(body.athlete_profile_id || body.athlete_id)
  if (!packageId || !athleteId) return mobileApiError({ code: 'invalid_request', message: 'Package and athlete are required.', status: 422, retryable: false, requestId })
  if (!(await userOwnsAthleteProfile(supabaseAdmin, user.id, athleteId))) {
    return mobileApiError({ code: 'athlete_forbidden', message: 'This athlete profile is unavailable.', status: 403, retryable: false, requestId })
  }
  const migration = await legacyTrainingMigration(packageId).catch(() => null)
  return mobileApiError({
    code: LEGACY_TRAINING_PURCHASE_DISABLED,
    message: migration?.unified_program_id
      ? 'This training package has moved to Offerings. Continue there to register.'
      : 'Legacy training packages are no longer available for purchase.',
    status: 409,
    retryable: false,
    requestId,
    details: {
      unified_program_id: migration?.unified_program_id || null,
      redirect_url: legacyTrainingRedirect(migration?.unified_program_id),
    },
  })
}
