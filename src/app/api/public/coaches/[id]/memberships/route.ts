import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadCoachOperatingMode, privateTrainingEnabled } from '@/lib/coachOperatingMode'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile } = await loadCoachOperatingMode(id)
  if (!profile?.isActive || !privateTrainingEnabled(profile.mode)) return NextResponse.json({ memberships: [] })
  const { data, error } = await supabaseAdmin
    .from('coach_membership_plans')
    .select('id, coach_id, name, description, price_cents, currency, billing_interval, included_sessions, member_only_access, stripe_price_id, status')
    .eq('coach_id', id)
    .eq('status', 'active')
    .order('price_cents', { ascending: true })

  if (error) return NextResponse.json({ memberships: [] })
  return NextResponse.json({ memberships: data || [] })
}
