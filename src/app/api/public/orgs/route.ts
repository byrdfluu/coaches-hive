import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [{ data: orgRows, error: orgError }, { data: settingsRows, error: settingsError }, { data: teamRows, error: teamError }] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('id, name, org_type'),
    supabaseAdmin
      .from('org_settings')
      .select('org_id, location'),
    supabaseAdmin
      .from('org_teams')
      .select('id, name, org_id'),
  ])

  if (orgError || settingsError || teamError) {
    return NextResponse.json({ error: 'Unable to load organizations.' }, { status: 500 })
  }

  return NextResponse.json({
    organizations: orgRows || [],
    settings: settingsRows || [],
    teams: teamRows || [],
  })
}
