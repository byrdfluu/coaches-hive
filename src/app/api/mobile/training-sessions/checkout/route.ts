import { randomUUID } from 'node:crypto'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileApiError } from '@/lib/mobileApiContract'
import { parseUuid } from '@/lib/uuid'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { LEGACY_TRAINING_PURCHASE_DISABLED, legacyTrainingRedirect } from '@/lib/legacyTrainingMigration'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const requestId = parseUuid(request.headers.get('x-request-id')) || randomUUID()
  const user = await getMobileRequestUser(request)
  if (!user) return mobileApiError({ requestId, code: 'unauthorized', message: 'Authentication is required.', status: 401, retryable: false })
  const body = await request.json().catch(() => ({}))
  const athleteId = parseUuid(body.athlete_profile_id || body.athlete_id)
  const sessionIds = Array.isArray(body.occurrence_ids) ? body.occurrence_ids.map(parseUuid).filter(Boolean) as string[] : []
  if (!athleteId || !sessionIds.length) return mobileApiError({ requestId, code: 'checkout_validation_failed', message: 'Choose valid training occurrences and try again.', status: 422, retryable: false })
  if (!await resolveAuthorizedAthleteContext(user.id, athleteId)) return mobileApiError({ requestId, code: 'athlete_unavailable', message: 'The selected athlete is unavailable.', status: 404, retryable: false })
  const { data: links } = await (supabaseAdmin as any).from('org_training_package_sessions').select('package_id').in('session_id', sessionIds)
  const packageIds = Array.from(new Set((links || []).map((row: any) => row.package_id))) as string[]
  const { data: mappings } = packageIds.length
    ? await (supabaseAdmin as any).from('legacy_training_package_migrations').select('unified_program_id').in('legacy_package_id', packageIds)
    : { data: [] }
  const programIds = Array.from(new Set((mappings || []).map((row: any) => row.unified_program_id).filter(Boolean))) as string[]
  const programId = programIds.length === 1 ? programIds[0] : null
  return mobileApiError({ requestId, code: LEGACY_TRAINING_PURCHASE_DISABLED,
    message: programId ? 'This training session has moved to Offerings. Continue there to register.' : 'Legacy training sessions are no longer available for new checkout.',
    status: 409, retryable: false, details: { unified_program_id: programId, redirect_url: legacyTrainingRedirect(programId) } })
}
