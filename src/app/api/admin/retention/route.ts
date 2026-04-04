import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET() {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const { data: policies, error: policyError } = await supabaseAdmin
    .from('data_retention_policies')
    .select('*')
    .order('table_name', { ascending: true })

  if (policyError) {
    return jsonError(policyError.message, 500)
  }

  const { data: backupRows, error: backupError } = await supabaseAdmin
    .from('backup_policies')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (backupError) {
    return jsonError(backupError.message, 500)
  }

  return NextResponse.json({
    policies: policies || [],
    backup: backupRows?.[0] || null,
  })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  const { policies, backup } = body || {}

  let updatedPolicies = null
  if (Array.isArray(policies) && policies.length > 0) {
    const payload = policies.map((policy: any) => ({
      table_name: policy.table_name,
      date_column: policy.date_column || 'created_at',
      retention_days: Number(policy.retention_days) || 0,
      enabled: Boolean(policy.enabled),
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    }))
    const { data, error: upsertError } = await supabaseAdmin
      .from('data_retention_policies')
      .upsert(payload, { onConflict: 'table_name' })
      .select('*')

    if (upsertError) {
      return jsonError(upsertError.message, 500)
    }
    updatedPolicies = data || []
  }

  let updatedBackup = null
  if (backup) {
    const backupPayload = {
      provider: backup.provider || 'supabase',
      frequency: backup.frequency || 'daily',
      retention_days: Number(backup.retention_days) || 30,
      status: backup.status || 'unverified',
      notes: backup.notes || null,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    }
    const { data, error: backupError } = await supabaseAdmin
      .from('backup_policies')
      .upsert(backupPayload, { onConflict: 'provider' })
      .select('*')
      .maybeSingle()

    if (backupError) {
      return jsonError(backupError.message, 500)
    }
    updatedBackup = data || null
  }

  return NextResponse.json({ policies: updatedPolicies, backup: updatedBackup })
}
