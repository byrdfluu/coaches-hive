import { NextResponse } from 'next/server'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { familyContactMatches, loadFamilyOrganizationContact } from '@/lib/familyOrganizationContact'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, retryable: status >= 500 } }, { status })

async function context(request: Request, body?: Record<string, unknown>) {
  const user = await getMobileRequestUser(request)
  if (!user) return { response: fail('unauthorized', 'Authentication is required.', 401) }
  const url = new URL(request.url)
  const orgId = normalizeUuid(body?.organization_id || url.searchParams.get('organization_id'))
  const athleteId = normalizeUuid(body?.athlete_profile_id || url.searchParams.get('athlete_profile_id'))
  if (!orgId || !athleteId) return { response: fail('invalid_request', 'Organization and athlete are required.', 422) }
  const athlete = await resolveAuthorizedAthleteContext(user.id, athleteId)
  if (!athlete) return { response: fail('ATHLETE_PROFILE_UNAVAILABLE', 'Athlete profile is unavailable.', 404) }
  const contact = await loadFamilyOrganizationContact(orgId, athlete.profileId)
  if (!contact) return { response: fail('family_contact_unavailable', 'Organization messaging contact is unavailable.', 404) }
  return { user, orgId, athlete, contact }
}

export async function GET(request: Request) {
  const resolved = await context(request)
  if ('response' in resolved) return resolved.response
  const query = new URL(request.url).searchParams.get('q') || ''
  return NextResponse.json({ contacts: familyContactMatches(resolved.contact, query) ? [resolved.contact] : [] },
    { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const resolved = await context(request, body)
  if ('response' in resolved) return resolved.response
  const suppliedContactId = normalizeUuid(body.contact_user_id)
  if (suppliedContactId && suppliedContactId !== resolved.contact.user_id) {
    return fail('family_contact_mismatch', 'Organization messaging contact is unavailable.', 409)
  }
  const { data, error } = await supabaseAdmin.rpc('open_family_contact_thread', {
    p_family_user_id: resolved.user.id,
    p_org_id: resolved.orgId,
    p_athlete_id: resolved.athlete.profileId,
  })
  if (error || !data) {
    console.error('[mobile/family/contacts] open failed', { code: error?.code || 'missing_result' })
    return fail('family_contact_thread_failed', 'Unable to open this conversation.', 503)
  }
  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({
    thread_id: row.thread_id,
    conversation_id: `thread:${row.thread_id}`,
    reused: Boolean(row.reused),
    contact: resolved.contact,
  })
}
