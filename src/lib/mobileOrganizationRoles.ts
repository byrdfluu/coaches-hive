import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError } from '@/lib/mobilePaymentApi'
import { isSuperadminUser } from '@/lib/recurringFees'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const ORG_ROLE_PERMISSION_KEYS = new Set([
  'view_dashboard','view_members','view_schedule','view_reports','view_audit','manage_members','manage_coaches',
  'manage_teams','manage_divisions','manage_schedule','manage_registrations','manage_documents','manage_waivers',
  'manage_payments','manage_billing','manage_marketplace','manage_seasons','manage_permissions','manage_announcements',
  'manage_settings',
  'send_announcements','send_messages','send_invoice','send_paperwork_reminders','export_logs',
])

export const permissionObject = (value: unknown) => {
  const keys = Array.isArray(value) ? value.map(String) : value && typeof value === 'object'
    ? Object.entries(value as Record<string, unknown>).filter(([, enabled]) => enabled === true).map(([key]) => key) : []
  if (keys.some((key) => !ORG_ROLE_PERMISSION_KEYS.has(key))) return null
  return Object.fromEntries(keys.map((key) => [key, true]))
}

export async function requireOrgRoleAccess(request: Request, orgId: string, permission?: string) {
  const user = await getMobileRequestUser(request)
  if (!user) return { response: mobileError('Unauthorized', 401) }
  if (await isSuperadminUser(user)) return { user, superadmin: true }
  const { data: member } = await supabaseAdmin.from('organization_memberships').select('id').eq('org_id', orgId)
    .eq('user_id', user.id).eq('status', 'active').maybeSingle()
  if (!member) return { response: mobileError('Forbidden', 403) }
  if (permission) {
    const { data: allowed } = await supabaseAdmin.rpc('organization_has_permission', { p_org_id: orgId, p_permission: permission, p_user_id: user.id })
    if (!allowed) return { response: mobileError('Forbidden', 403) }
  }
  return { user, superadmin: false }
}

export async function roleAudit(user: { id: string; email?: string }, orgId: string, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabaseAdmin.from('org_audit_log').insert({ org_id: orgId, actor_id: user.id,
    actor_email: user.email || null, action, target_type: 'organization_role', target_id: targetId, metadata })
  if (error) throw new Error(`Unable to record role audit: ${error.message}`)
}
