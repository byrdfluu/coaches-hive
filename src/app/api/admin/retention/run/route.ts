import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const RETENTION_TABLES: Record<string, string> = {
  admin_audit_log: 'created_at',
  notifications: 'created_at',
  message_receipts: 'created_at',
}

export async function POST() {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const { data: policies, error: policyError } = await supabaseAdmin
    .from('data_retention_policies')
    .select('*')
    .eq('enabled', true)

  if (policyError) {
    return jsonError(policyError.message, 500)
  }

  const results: Array<{ table: string; deleted: number; cutoff: string }> = []
  const now = Date.now()

  for (const policy of policies || []) {
    const tableName = policy.table_name
    const dateColumn = RETENTION_TABLES[tableName]
    if (!dateColumn) continue
    const retentionDays = Number(policy.retention_days) || 0
    if (retentionDays <= 0) continue
    const cutoffDate = new Date(now - retentionDays * 24 * 60 * 60 * 1000).toISOString()

    const { error: deleteError, count } = await supabaseAdmin
      .from(tableName)
      .delete({ count: 'exact' })
      .lt(dateColumn, cutoffDate)

    if (deleteError) {
      return jsonError(deleteError.message, 500)
    }

    await supabaseAdmin.from('data_retention_runs').insert({
      table_name: tableName,
      cutoff: cutoffDate,
      deleted_count: count || 0,
      run_by: session.user.id,
    })

    results.push({ table: tableName, deleted: count || 0, cutoff: cutoffDate })
  }

  return NextResponse.json({ results })
}
