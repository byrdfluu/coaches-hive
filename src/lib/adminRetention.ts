import { supabaseAdmin } from '@/lib/supabaseAdmin'

const RETENTION_TABLES: Record<string, string> = {
  admin_audit_log: 'created_at',
  notifications: 'created_at',
  message_receipts: 'created_at',
}

export async function executeRetentionPolicies(runBy: string) {
  const { data: policies, error } = await supabaseAdmin
    .from('data_retention_policies')
    .select('*')
    .eq('enabled', true)
  if (error) throw error

  const results: Array<{ table: string; deleted: number; cutoff: string }> = []
  for (const policy of policies || []) {
    const dateColumn = RETENTION_TABLES[policy.table_name]
    const retentionDays = Number(policy.retention_days) || 0
    if (!dateColumn || retentionDays <= 0) continue
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
    const { error: deleteError, count } = await supabaseAdmin
      .from(policy.table_name)
      .delete({ count: 'exact' })
      .lt(dateColumn, cutoff)
    if (deleteError) throw deleteError
    await supabaseAdmin.from('data_retention_runs').insert({
      table_name: policy.table_name,
      cutoff,
      deleted_count: count || 0,
      run_by: runBy,
    })
    results.push({ table: policy.table_name, deleted: count || 0, cutoff })
  }
  return results
}
