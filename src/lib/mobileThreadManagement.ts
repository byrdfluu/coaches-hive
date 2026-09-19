import type { User } from '@supabase/supabase-js'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError } from '@/lib/mobilePaymentApi'
import { isSuperadminUser } from '@/lib/recurringFees'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function requireMobileThread(request: Request, threadId: string) {
  const user = await getMobileRequestUser(request)
  if (!user) return { response: mobileError('Unauthorized', 401) }
  const { data: thread } = await supabaseAdmin.from('threads')
    .select('id,title,name,image_url,created_by,owner_id,org_id,organization_id,team_id,program_id,season_id,league_id,is_group,updated_at')
    .eq('id', threadId).maybeSingle()
  if (!thread) return { response: mobileError('Thread not found', 404) }
  const { data: participant } = await supabaseAdmin.from('thread_participants').select('*')
    .eq('thread_id', threadId).eq('user_id', user.id).maybeSingle()
  const superadmin = await isSuperadminUser(user)
  if (!participant && !superadmin) return { response: mobileError('Forbidden', 403) }
  const orgId = thread.organization_id || thread.org_id || null
  const { data: canManage } = orgId ? await supabaseAdmin.rpc('organization_has_permission', {
    p_org_id: orgId, p_permission: 'send_messages', p_user_id: user.id,
  }) : { data: false }
  const admin = superadmin || thread.owner_id === user.id || thread.created_by === user.id
    || participant?.role === 'admin' || Boolean(canManage)
  return { user, thread, participant, admin, orgId }
}

export async function scopedUserCanJoin(thread: Record<string, any>, userId: string) {
  const orgId = thread.organization_id || thread.org_id || null
  if (orgId) {
    const { data } = await supabaseAdmin.from('organization_memberships').select('id').eq('org_id', orgId)
      .eq('user_id', userId).eq('status', 'active').maybeSingle()
    if (!data) return false
  }
  if (thread.team_id) {
    const [{ data: member }, { data: coach }] = await Promise.all([
      supabaseAdmin.from('org_team_members').select('id').eq('team_id', thread.team_id).eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('org_team_coaches').select('id').eq('team_id', thread.team_id).eq('coach_id', userId).maybeSingle(),
    ])
    if (!member && !coach) return false
  }
  if (thread.program_id) {
    const [{ data: registration }, { data: program }] = await Promise.all([
      supabaseAdmin.from('program_registrations').select('id').eq('program_id', thread.program_id).eq('owner_user_id', userId).maybeSingle(),
      supabaseAdmin.from('programs').select('coach_id').eq('id', thread.program_id).maybeSingle(),
    ])
    if (!registration && program?.coach_id !== userId) return false
  }
  if (thread.league_id) {
    const { data } = await supabaseAdmin.from('league_memberships').select('id').eq('league_id', thread.league_id)
      .eq('user_id', userId).eq('status', 'active').maybeSingle()
    if (!data) return false
  }
  return true
}

export async function threadAudit(user: User, thread: Record<string, any>, action: string, metadata: Record<string, unknown> = {}) {
  const orgId = thread.organization_id || thread.org_id || null
  const payload = { actor_id: user.id, actor_email: user.email || null, action, target_type: 'thread', target_id: thread.id, metadata }
  const result = orgId
    ? await supabaseAdmin.from('org_audit_log').insert({ ...payload, org_id: orgId })
    : await supabaseAdmin.from('admin_audit_log').insert(payload)
  if (result.error) throw new Error(`Unable to record thread audit event: ${result.error.message}`)
}

export const participantRole = (role: unknown) => role === 'coach' ? 'coach' : role === 'admin' || role === 'superadmin' ? 'admin' : 'athlete'
