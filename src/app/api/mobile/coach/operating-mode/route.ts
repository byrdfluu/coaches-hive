import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { loadCoachOperatingMode, privateTrainingEnabled, teamManagementEnabled } from '@/lib/coachOperatingMode'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'

const safeError = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message } }, { status })

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return safeError('UNAUTHORIZED', 'Authentication is required.', 401)
  const workspaceId = normalizeUuid(request.headers.get('x-workspace-id'))
  if (!workspaceId) return safeError('WORKSPACE_REQUIRED', 'Select a team workspace and try again.', 422)
  const { data: workspace } = await supabaseAdmin.from('business_workspaces')
    .select('id,workspace_type,owner_user_id,status').eq('id', workspaceId).maybeSingle()
  if (!workspace || workspace.status !== 'active' || workspace.workspace_type !== 'independent_coach' || workspace.owner_user_id !== user.id) {
    return safeError('WORKSPACE_OWNER_REQUIRED', 'Only the team workspace owner can manage this setting.', 403)
  }
  const { profile, error } = await loadCoachOperatingMode(user.id)
  if (error || !profile) return safeError('COACH_PROFILE_UNAVAILABLE', 'Coach profile is unavailable.', 404)
  return NextResponse.json({ workspace_id: workspace.id, operating_mode: profile.mode,
    team_management_enabled: teamManagementEnabled(profile.mode), private_training_enabled: privateTrainingEnabled(profile.mode) },
  { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return safeError('UNAUTHORIZED', 'Authentication is required.', 401)
  const workspaceId = normalizeUuid(request.headers.get('x-workspace-id'))
  if (!workspaceId) return safeError('WORKSPACE_REQUIRED', 'Select a team workspace and try again.', 422)
  const body = await request.json().catch(() => ({}))
  const requestedMode = String(body?.operating_mode || '').trim().toLowerCase()
  if (!['single_team', 'both'].includes(requestedMode)) {
    return safeError('INVALID_OPERATING_MODE', 'Choose whether private training is enabled for this team workspace.', 422)
  }
  const { data: workspace } = await supabaseAdmin.from('business_workspaces')
    .select('id,workspace_type,owner_user_id,status').eq('id', workspaceId).maybeSingle()
  if (!workspace || workspace.status !== 'active' || workspace.workspace_type !== 'independent_coach' || workspace.owner_user_id !== user.id) {
    return safeError('WORKSPACE_OWNER_REQUIRED', 'Only the team workspace owner can manage this setting.', 403)
  }
  const { profile, error: profileError } = await loadCoachOperatingMode(user.id)
  if (profileError || !profile) return safeError('COACH_PROFILE_UNAVAILABLE', 'Coach profile is unavailable.', 404)
  if (profile.mode === 'independent_coach') {
    return safeError('MODE_CHANGE_UNAVAILABLE', 'Independent trainer accounts cannot be changed with the team private-training toggle.', 409)
  }
  const { data, error } = await supabaseAdmin.from('independent_coach_profiles')
    .update({ operating_mode: requestedMode, updated_at: new Date().toISOString() })
    .eq('coach_id', user.id).select('operating_mode').single()
  if (error || !data) return safeError('OPERATING_MODE_UPDATE_FAILED', 'Unable to update private training right now.', 500)
  return NextResponse.json({ workspace_id: workspace.id, operating_mode: data.operating_mode,
    team_management_enabled: true, private_training_enabled: data.operating_mode === 'both' },
  { headers: { 'Cache-Control': 'private, no-store' } })
}
