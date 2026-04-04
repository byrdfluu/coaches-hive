import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const planId = params.id
  if (!planId) return jsonError('plan id is required')

  const { data: plan, error: planError } = await supabaseAdmin
    .from('practice_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle()

  if (planError) {
    return jsonError(planError.message, 500)
  }

  if (!plan) {
    return jsonError('Plan not found', 404)
  }

  const { data: attachments } = await supabaseAdmin
    .from('practice_plan_attachments')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true })

  return NextResponse.json({ plan, attachments: attachments || [] })
}
