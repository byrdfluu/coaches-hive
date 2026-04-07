import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

// Returns orders for the authenticated coach, bypassing RLS.
export async function GET() {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const coachId = session.user.id

  const { data, error: queryError } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  return NextResponse.json({ orders: data || [] })
}