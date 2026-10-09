import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }

async function context(request: Request, body?: any) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }) }
  const url = new URL(request.url)
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, body?.athlete_profile_id || url.searchParams.get('athlete_profile_id'))
  if (!athlete) return { error: NextResponse.json({ error: 'That athlete profile is unavailable.' }, { status: 403 }) }
  return { athlete, error: null }
}

export async function GET(request: Request) {
  const auth = await context(request)
  if (auth.error) return auth.error
  const { data, error } = await supabaseAdmin.from('athlete_saved_organizations').select('id,org_id,created_at').eq('athlete_id', auth.athlete!.profileId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Unable to load saved organizations.' }, { status: 500 })
  const orgIds = (data || []).map(row => row.org_id)
  const { data: settings } = orgIds.length ? await supabaseAdmin.from('org_settings').select('org_id,org_name,profile_image_url').in('org_id', orgIds) : { data: [] }
  const details = new Map((settings || []).map(row => [row.org_id, row]))
  return NextResponse.json({ saved_organizations: (data || []).map(row => ({ ...row, organization: details.get(row.org_id) || null })) }, { headers: noStore })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const auth = await context(request, body)
  if (auth.error) return auth.error
  const orgId = String(body?.org_id || '')
  if (!orgId) return NextResponse.json({ error: 'Organization is required.' }, { status: 400 })
  const { data: organization } = await supabaseAdmin.from('organizations').select('id').eq('id', orgId).maybeSingle()
  if (!organization) return NextResponse.json({ error: 'Organization was not found.' }, { status: 404 })
  const { data, error } = await supabaseAdmin.from('athlete_saved_organizations').upsert({ athlete_id: auth.athlete!.profileId, org_id: orgId }, { onConflict: 'athlete_id,org_id' }).select('*').single()
  if (error) return NextResponse.json({ error: 'Unable to save this organization.' }, { status: 500 })
  return NextResponse.json({ saved_organization: data }, { status: 201, headers: noStore })
}

export async function DELETE(request: Request) {
  const auth = await context(request)
  if (auth.error) return auth.error
  const orgId = String(new URL(request.url).searchParams.get('org_id') || '')
  if (!orgId) return NextResponse.json({ error: 'Organization is required.' }, { status: 400 })
  const { error } = await supabaseAdmin.from('athlete_saved_organizations').delete().eq('athlete_id', auth.athlete!.profileId).eq('org_id', orgId)
  if (error) return NextResponse.json({ error: 'Unable to remove this organization.' }, { status: 500 })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
