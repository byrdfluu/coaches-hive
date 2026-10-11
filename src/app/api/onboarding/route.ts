import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getPostHogClient } from '@/lib/posthog-server'
import {resolveActiveOrganizationStaffContext}from'@/lib/organizationStaffContext'
export const dynamic = 'force-dynamic'


export async function GET() {
  const { session, supabase, error } = await getSessionRole()
  if (error || !session) return error

  const { data, error: fetchError } = await supabaseAdmin
    .from('user_onboarding')
    .select('user_id, role, completed_steps, completed_at, updated_at')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (fetchError) {
    return jsonError(fetchError.message, 500)
  }

  const familyActive=session.user.user_metadata?.active_role==='athlete'
  const staffContext=familyActive?null:await resolveActiveOrganizationStaffContext(supabase,session.user.user_metadata?.current_org_id||null,session.user.user_metadata?.active_workspace_id||null)
  return NextResponse.json({ onboarding: data || null, organization_staff_covered:Boolean(staffContext), active_workspace_id:staffContext?.workspaceId||null, acting_role:staffContext?.actingRole||null },{headers:{'Cache-Control':'private, no-store, max-age=0'}})
}

export async function POST(request: Request) {
  const { session, supabase, error } = await getSessionRole()
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { role, completed_steps = [], total_steps = 0 } = body || {}

  if (!role || !Array.isArray(completed_steps)) {
    return jsonError('role and completed_steps are required', 400)
  }
  const familyActive=session.user.user_metadata?.active_role==='athlete'
  const staffContext=familyActive?null:await resolveActiveOrganizationStaffContext(supabase,session.user.user_metadata?.current_org_id||null,session.user.user_metadata?.active_workspace_id||null)
  if(staffContext)return NextResponse.json({onboarding:null,organization_staff_covered:true,active_workspace_id:staffContext.workspaceId,acting_role:staffContext.actingRole})

  const completedAt = total_steps > 0 && completed_steps.length >= total_steps
    ? new Date().toISOString()
    : null

  const { data, error: upsertError } = await supabaseAdmin
    .from('user_onboarding')
    .upsert({
      user_id: session.user.id,
      role,
      completed_steps,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    })
    .select('user_id, role, completed_steps, completed_at, updated_at')
    .maybeSingle()

  if (upsertError) {
    return jsonError(upsertError.message, 500)
  }

  if (completedAt && data) {
    const posthog = getPostHogClient()
    posthog.capture({
      distinctId: session.user.id,
      event: 'onboarding_completed',
      properties: {
        role,
        total_steps: total_steps || completed_steps.length,
      },
    })
  }

  return NextResponse.json({ onboarding: data })
}
