import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin.from('facility_bookings')
    .select('id,facility_id,space_id,starts_at,ends_at,duration_minutes,amount_cents,status,cancellation_fee_cents,refunded_amount_cents,facilities(name,cancellation_policy),facility_spaces(name)')
    .eq('booked_by_user_id', user.id).order('starts_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: 'Unable to load facility bookings.' }, { status: 500 })
  return NextResponse.json({ bookings: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}
