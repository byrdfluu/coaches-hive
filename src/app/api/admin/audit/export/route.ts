import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return ''
  const raw = String(value)
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

const toCsv = (rows: Array<Array<string | number | null | undefined>>) =>
  rows.map((row) => row.map(csvEscape).join(',')).join('\n')

export async function GET() {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const { data, error: fetchError } = await supabaseAdmin
    .from('admin_audit_log')
    .select('id, actor_email, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (fetchError) {
    return jsonError(fetchError.message, 500)
  }

  const rows = [
    ['Time', 'Actor', 'Action', 'Target type', 'Target id', 'Metadata'],
    ...(data || []).map((row: any) => [
      row.created_at,
      row.actor_email || '',
      row.action,
      row.target_type || '',
      row.target_id || '',
      row.metadata ? JSON.stringify(row.metadata) : '',
    ]),
  ]

  const csv = toCsv(rows)
  const today = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="admin-audit-${today}.csv"`,
    },
  })
}
