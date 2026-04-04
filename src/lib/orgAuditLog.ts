import { supabaseAdmin } from '@/lib/supabaseAdmin'

type OrgAuditInput = {
  orgId: string
  action: string
  actorId?: string | null
  actorEmail?: string | null
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, any> | null
}

export const logOrgAction = async ({
  orgId,
  action,
  actorId,
  actorEmail,
  targetType,
  targetId,
  metadata,
}: OrgAuditInput) => {
  try {
    await supabaseAdmin.from('org_audit_log').insert({
      org_id: orgId,
      action,
      actor_id: actorId || null,
      actor_email: actorEmail || null,
      target_type: targetType || null,
      target_id: targetId || null,
      metadata: metadata || null,
    })
  } catch (error) {
    console.error('Org audit log insert failed', error)
  }
}
