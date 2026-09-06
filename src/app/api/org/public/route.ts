import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const noStoreHeaders = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }
const jsonError = (message: string, status = 400) => NextResponse.json(
  { error: status >= 500 ? 'Internal server error' : message },
  { status, headers: noStoreHeaders },
)

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const legacyObject = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const text = (value: unknown, fallback: unknown = null) => {
  const current = typeof value === 'string' ? value.trim() : ''
  if (current) return current
  const old = typeof fallback === 'string' ? fallback.trim() : ''
  return old || null
}
const list = (value: unknown, fallback: unknown = []) => {
  const current = Array.isArray(value) ? value.map(String).map(item => item.trim()).filter(Boolean) : []
  if (current.length) return current
  if (Array.isArray(fallback)) return fallback.map(String).map(item => item.trim()).filter(Boolean)
  if (typeof fallback === 'string') return fallback.split(',').map(item => item.trim()).filter(Boolean)
  return []
}

export async function GET(request: Request) {
  const identifier = (new URL(request.url).searchParams.get('slug') || '').trim()
  if (!identifier) return jsonError('slug is required')

  let organization: { id: string; name: string; org_type?: string | null } | null = null
  if (isUuid(identifier)) {
    const result = await supabaseAdmin.from('organizations').select('id,name,org_type').eq('id', identifier).maybeSingle()
    if (result.error) return jsonError(result.error.message, 500)
    organization = result.data
  } else {
    const result = await supabaseAdmin.from('organizations').select('id,name,org_type')
    if (result.error) return jsonError(result.error.message, 500)
    organization = (result.data || []).find(row => slugify(row.name || '') === slugify(identifier)) || null
  }
  if (!organization) return jsonError('Organization not found', 404)

  const [settingsResult, teamsResult, athleteCountResult, galleryResult, tryoutsResult, formsResult] = await Promise.all([
    supabaseAdmin.from('org_settings').select([
      'org_name','director_display_name','profile_image_url','description','location','service_area','sports','programs',
      'age_groups','competition_levels','website_url','social_links',
      'registration_status','registration_deadline','pricing_summary','achievements','affiliations','facilities',
      'practice_locations','public_document_urls','inquiry_url','season_start','season_end','portal_preferences',
      'brand_logo_url','brand_cover_url','brand_primary_color','brand_accent_color',
    ].join(',')).eq('org_id', organization.id).maybeSingle(),
    supabaseAdmin.from('org_teams').select('id,name,age_group,competition_level,registration_status,roster_capacity').eq('org_id', organization.id).order('name'),
    supabaseAdmin.from('athlete_organization_memberships').select('id', { count: 'exact', head: true }).eq('org_id', organization.id).eq('status', 'active'),
    supabaseAdmin.from('profile_gallery_images').select('id,image_url,created_at').eq('owner_type', 'org').eq('org_id', organization.id).order('created_at', { ascending: false }),
    supabaseAdmin.from('tryout_events').select('id,name,sport,age_group,event_date,event_time,max_slots,registration_fee_cents,status').eq('org_id', organization.id).eq('status', 'open').order('event_date'),
    supabaseAdmin.from('org_enrollment_forms').select('id,title,description,slug,sport,age_group,is_active,enrollment_fee_cents').eq('org_id', organization.id).eq('is_active', true).order('created_at', { ascending: false }),
  ])
  if (settingsResult.error || teamsResult.error || athleteCountResult.error || galleryResult.error) {
    return jsonError('Unable to load organization profile.', 500)
  }

  const settings = settingsResult.data || {} as Record<string, any>
  const preferences = legacyObject((settings as any).portal_preferences)
  const legacy = legacyObject(preferences.public_profile)
  if (legacy.enabled === false || legacy.visible === false) {
    return NextResponse.json({ org: null, unavailable_reason: 'private' }, { status: 403, headers: noStoreHeaders })
  }
  const legacyGallery = Array.isArray(preferences.public_gallery) ? preferences.public_gallery : []
  const teams = teamsResult.data || []
  const teamIds = teams.map(team => team.id)
  const { data: assignments, error: assignmentError } = teamIds.length
    ? await supabaseAdmin.from('org_team_coaches').select('team_id,coach_id').in('team_id', teamIds)
    : { data: [], error: null }
  if (assignmentError) return jsonError('Unable to load public team coaches.', 500)
  const coachIds = Array.from(new Set((assignments || []).map(row => row.coach_id).filter(Boolean)))
  const { data: coaches, error: coachError } = coachIds.length
    ? await supabaseAdmin.from('profiles').select('id,full_name').in('id', coachIds)
    : { data: [], error: null }
  if (coachError) return jsonError('Unable to load public team coaches.', 500)
  const coachNameById = new Map((coaches || []).map(coach => [coach.id, coach.full_name || 'Coach']))
  const coachNamesByTeam = new Map<string,string[]>()
  for (const assignment of assignments || []) {
    const name = coachNameById.get(assignment.coach_id)
    if (!name) continue
    coachNamesByTeam.set(assignment.team_id, [...(coachNamesByTeam.get(assignment.team_id) || []), name])
  }

  const gallery = (galleryResult.data || []).map(image => ({ id: image.id, image_url: image.image_url, created_at: image.created_at }))
  if (!gallery.length) {
    legacyGallery.map(String).map(item => item.trim()).filter(Boolean).forEach((imageUrl, index) => gallery.push({ id: `legacy-${index}`, image_url: imageUrl, created_at: null }))
  }

  return NextResponse.json({ org: {
    id: organization.id,
    name: text((settings as any).org_name, organization.name) || organization.name,
    org_type: organization.org_type || null,
    director_display_name: text((settings as any).director_display_name),
    profile_image_url: text((settings as any).profile_image_url, (settings as any).brand_logo_url),
    description: text((settings as any).description, legacy.mission),
    location: text((settings as any).location),
    service_area: text((settings as any).service_area, legacy.service_area),
    sports: list((settings as any).sports),
    programs: list((settings as any).programs, legacy.program_categories),
    age_groups: list((settings as any).age_groups, legacy.ages_served),
    competition_levels: list((settings as any).competition_levels),
    // Contact happens through authenticated Coaches Hive messaging. Do not
    // expose direct email or phone data through a public profile response.
    website_url: text((settings as any).website_url, legacy.website_url),
    social_links: list((settings as any).social_links, [legacy.instagram_url, legacy.facebook_url, legacy.x_url].filter(Boolean)),
    registration_status: text((settings as any).registration_status, legacy.registration_status),
    registration_deadline: (settings as any).registration_deadline || null,
    pricing_summary: text((settings as any).pricing_summary),
    achievements: list((settings as any).achievements),
    affiliations: list((settings as any).affiliations),
    facilities: list((settings as any).facilities),
    practice_locations: list((settings as any).practice_locations),
    public_document_urls: list((settings as any).public_document_urls),
    inquiry_url: text((settings as any).inquiry_url),
    season_start: (settings as any).season_start || null,
    season_end: (settings as any).season_end || null,
    brand_cover_url: (settings as any).brand_cover_url || null,
    brand_primary_color: (settings as any).brand_primary_color || null,
    brand_accent_color: (settings as any).brand_accent_color || null,
    active_athlete_count: athleteCountResult.count || 0,
    teams: teams.map(team => ({ ...team, coach_names: coachNamesByTeam.get(team.id) || [] })),
    gallery,
    open_tryouts: tryoutsResult.error ? [] : tryoutsResult.data || [],
    enrollment_forms: formsResult.error ? [] : formsResult.data || [],
  } }, { headers: noStoreHeaders })
}
