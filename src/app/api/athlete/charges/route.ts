import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const { data: assignments } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, status, paid_at, created_at')
    .eq('athlete_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const feeIds = (assignments || []).map((row) => row.fee_id)
  const { data: fees } = feeIds.length
    ? await supabaseAdmin
        .from('org_fees')
        .select('id, org_id, title, amount_cents, due_date, audience_type, team_id, created_by, created_at')
        .in('id', feeIds)
    : { data: [] }

  return NextResponse.json({ assignments: assignments || [], fees: fees || [] })
}
