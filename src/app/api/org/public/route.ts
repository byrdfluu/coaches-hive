import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  )

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug') || ''
  if (!slug) {
    return jsonError('slug is required')
  }

  const { data: orgs, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, org_type')

  if (error) {
    return jsonError(error.message, 500)
  }

  const match = (orgs || []).find((org) => slugify(org.name || '') === slug)
  if (!match) {
    return jsonError('Organization not found', 404)
  }

  const { data: settings } = await supabaseAdmin
    .from('org_settings')
    .select('brand_logo_url, brand_cover_url, brand_primary_color, brand_accent_color, policy_notes, location, season_start, season_end, portal_preferences')
    .eq('org_id', match.id)
    .maybeSingle()

  const publicProfile =
    settings?.portal_preferences &&
    typeof settings.portal_preferences === 'object' &&
    'public_profile' in settings.portal_preferences
      ? (settings.portal_preferences as Record<string, unknown>).public_profile
      : {}

  const publicGalleryRaw =
    settings?.portal_preferences &&
    typeof settings.portal_preferences === 'object' &&
    'public_gallery' in settings.portal_preferences
      ? (settings.portal_preferences as Record<string, unknown>).public_gallery
      : []

  const publicProfileMap =
    publicProfile && typeof publicProfile === 'object'
      ? (publicProfile as Record<string, unknown>)
      : {}
  const publicGallery = Array.isArray(publicGalleryRaw)
    ? publicGalleryRaw.map((item) => String(item || '').trim()).filter(Boolean)
    : []

  return NextResponse.json({
    org: {
      id: match.id,
      name: match.name,
      org_type: match.org_type || null,
      brand_logo_url: settings?.brand_logo_url || null,
      brand_cover_url: settings?.brand_cover_url || null,
      brand_primary_color: settings?.brand_primary_color || null,
      brand_accent_color: settings?.brand_accent_color || null,
      location: settings?.location || null,
      policy_notes: settings?.policy_notes || null,
      season_start: settings?.season_start || null,
      season_end: settings?.season_end || null,
      mission: String(publicProfileMap.mission || ''),
      website_url: String(publicProfileMap.website_url || ''),
      instagram_url: String(publicProfileMap.instagram_url || ''),
      facebook_url: String(publicProfileMap.facebook_url || ''),
      x_url: String(publicProfileMap.x_url || ''),
      service_area: String(publicProfileMap.service_area || ''),
      program_categories: String(publicProfileMap.program_categories || ''),
      ages_served: String(publicProfileMap.ages_served || ''),
      business_hours: String(publicProfileMap.business_hours || ''),
      registration_status: String(publicProfileMap.registration_status || ''),
      public_gallery: publicGallery,
    },
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
