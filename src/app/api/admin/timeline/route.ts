import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth = await requireSuperadminApi(); if (auth.error) return auth.error
  const p = new URL(request.url).searchParams, userId = p.get('user_id'), workspaceId = p.get('workspace_id')
  if (!userId && !workspaceId) return NextResponse.json({ error: 'user_id or workspace_id is required' }, { status: 400 })
  const events: any[] = []
  if (userId) {
    const supabase = await createRouteHandlerClientCompat(); const { data, error } = await supabase.rpc('admin_user_support_timeline', { p_user_id: userId })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 }); events.push(...(data || []))
  }
  if (workspaceId) {
    const [tickets, notifications, handoffs, payments, refunds, subscriptions, audits] = await Promise.all([
      supabaseAdmin.from('support_tickets').select('*').eq('workspace_id', workspaceId).limit(250),
      supabaseAdmin.from('notifications').select('*').eq('workspace_id', workspaceId).limit(250),
      supabaseAdmin.from('mobile_checkout_handoffs').select('*').eq('workspace_id', workspaceId).limit(250),
      supabaseAdmin.from('stripe_connect_payment_accounting').select('*').eq('workspace_id', workspaceId).limit(250),
      supabaseAdmin.from('payment_refund_requests').select('*').eq('workspace_id', workspaceId).limit(250),
      supabaseAdmin.from('platform_subscriptions').select('*').eq('workspace_id', workspaceId).limit(250),
      supabaseAdmin.from('workspace_audit_events').select('*').eq('workspace_id', workspaceId).limit(250),
    ])
    const add = (rows: any[], type: string, date: string) => rows.forEach(r => events.push({ ...r, event_type: type, occurred_at: r[date], workspace_id: workspaceId }))
    add(tickets.data || [], 'support', 'created_at'); add(notifications.data || [], 'notification', 'created_at'); add(handoffs.data || [], 'checkout', 'created_at'); add(payments.data || [], 'payment', 'created_at'); add(refunds.data || [], 'refund', 'requested_at'); add(subscriptions.data || [], 'subscription', 'updated_at'); add(audits.data || [], 'workspace_change', 'occurred_at')
  }
  return NextResponse.json({ items: events.sort((a,b) => Date.parse(b.occurred_at || '') - Date.parse(a.occurred_at || '')).slice(0,500) })
}
