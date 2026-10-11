import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveOrganizationStaffContext } from '@/lib/organizationStaffContext'

const ORG_ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','admin']
const allowed = ['coach', 'athlete', ...ORG_ROLES]
const config = {
  coach: { table: 'coach_notification_preferences', key: 'coach_id', fields: ['schedule_changes','new_messages','marketplace_orders','waiver_updates','attendance_reminders'] },
  athlete: { table: 'athlete_notification_preferences', key: 'athlete_id', fields: ['schedule_changes','payment_reminders','marketplace_updates','waiver_reminders','messages'] },
  org: { table: 'org_notification_preferences', key: 'org_id', fields: ['new_message','payment_reminders','marketplace_orders','roster_updates','schedule_changes','new_invite_accepted','attendance_alerts','weekly_digest'] },
} as const
async function target(role: string, userId: string, metadata: Record<string, unknown>, client: SupabaseClient) {
  if (role === 'coach' || role === 'athlete') return { ...config[role], id: userId, portal: role }
  const context = await resolveActiveOrganizationStaffContext(
    client,
    String(metadata.current_org_id || '') || null,
    String(metadata.active_workspace_id || '') || null,
  )
  return context ? { ...config.org, id: context.organizationId, portal: 'org' } : null
}
export async function GET() { const { session, role, error, supabase } = await getSessionRole(allowed); if (error) return error; if (!session || !role) return jsonError('Unauthorized', 401); const selected = await target(role, session.user.id, session.user.user_metadata || {}, supabase); if (!selected) return jsonError('Workspace not found', 404); const { data, error: q } = await supabaseAdmin.from(selected.table).select('*').eq(selected.key, selected.id).maybeSingle(); if (q) return jsonError(q.message, 500); return NextResponse.json({ portal: selected.portal, fields: selected.fields, preferences: data || Object.fromEntries(selected.fields.map((field) => [field, true])) }) }
export async function PATCH(request: Request) { const { session, role, error, supabase } = await getSessionRole(allowed); if (error) return error; if (!session || !role) return jsonError('Unauthorized', 401); const selected = await target(role, session.user.id, session.user.user_metadata || {}, supabase); if (!selected) return jsonError('Workspace not found', 404); const body = await request.json().catch(() => ({})); const values = Object.fromEntries(selected.fields.filter((field) => typeof body[field] === 'boolean').map((field) => [field, body[field]])); const { error: q } = await supabaseAdmin.from(selected.table).upsert({ [selected.key]: selected.id, ...values, updated_at: new Date().toISOString() }, { onConflict: selected.key }); if (q) return jsonError(q.message, 500); return NextResponse.json({ ok: true }) }
