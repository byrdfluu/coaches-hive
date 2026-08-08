import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const { id } = await context.params
  const { data: workspace, error } = await supabaseAdmin.from('business_workspaces')
    .select('id,workspace_type,organization_id,owner_user_id,display_name,status,created_at,updated_at')
    .eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load workspace.' }, { status: 500 })
  if (!workspace) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })

  const [memberships, athleteRelationships, requests, subscriptions, connectAccounts, handoffs, accounting, refunds, disputes, webhookEvents, audits] = await Promise.all([
    supabaseAdmin.from('workspace_memberships')
      .select('id,user_id,roles,permissions,status,created_at,updated_at,profiles!user_id(email,full_name)')
      .eq('workspace_id', id).order('created_at'),
    supabaseAdmin.from('workspace_athlete_relationships')
      .select('id,athlete_id,relationship_type,status,approved_by,created_at,updated_at,athlete_profiles!athlete_id(id,full_name,owner_user_id)')
      .eq('workspace_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('athlete_access_requests').select('*').eq('workspace_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('platform_subscriptions').select('*').eq('workspace_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('stripe_connect_accounts').select('*').eq('workspace_id', id).order('updated_at', { ascending: false }),
    supabaseAdmin.from('mobile_checkout_handoffs').select('*').eq('workspace_id', id).order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('stripe_connect_payment_accounting').select('*').eq('workspace_id', id).order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('payment_refund_requests').select('*').eq('workspace_id', id).order('requested_at', { ascending: false }).limit(100),
    supabaseAdmin.from('order_disputes').select('*').eq('workspace_id', id).order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('stripe_webhook_events').select('*').eq('workspace_id', id).order('received_at', { ascending: false }).limit(100),
    supabaseAdmin.from('workspace_audit_events').select('*').eq('workspace_id', id).order('occurred_at', { ascending: false }).limit(200),
  ])

  const firstError = [memberships, athleteRelationships, requests, subscriptions, connectAccounts, handoffs, accounting, refunds, disputes, webhookEvents, audits]
    .find((result) => result.error)?.error
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })

  const connect = connectAccounts.data?.[0] || null
  return NextResponse.json({
    workspace: {
      ...workspace,
      connect_ready: Boolean(connect?.charges_enabled && connect?.payouts_enabled),
    },
    members: memberships.data || [],
    athletes: athleteRelationships.data || [],
    requests: requests.data || [],
    subscriptions: subscriptions.data || [],
    connect_accounts: connectAccounts.data || [],
    checkout_handoffs: handoffs.data || [],
    operational_records: accounting.data || [],
    refunds: refunds.data || [],
    disputes: disputes.data || [],
    webhook_events: webhookEvents.data || [],
    audit_events: audits.data || [],
  })
}
