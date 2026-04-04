import { supabaseAdmin } from '@/lib/supabaseAdmin'

type AuditInput = {
  action: string
  actorId?: string | null
  actorEmail?: string | null
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, any> | null
}

export const logAdminAction = async ({
  action,
  actorId,
  actorEmail,
  targetType,
  targetId,
  metadata,
}: AuditInput) => {
  try {
    await supabaseAdmin.from('admin_audit_log').insert({
      action,
      actor_id: actorId || null,
      actor_email: actorEmail || null,
      target_type: targetType || null,
      target_id: targetId || null,
      metadata: metadata || null,
    })
  } catch (error) {
    console.error('Audit log insert failed', error)
  }
}
