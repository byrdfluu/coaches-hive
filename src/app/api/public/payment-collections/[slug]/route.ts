import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [{ data: event }, { data: campaign }] = await Promise.all([
    supabaseAdmin.from('org_event_collections').select('id,name,event_type,starts_at,ends_at,location,total_cost_cents,per_player_amount_cents,payment_deadline,slug,org_id').eq('slug',slug).eq('active',true).maybeSingle(),
    supabaseAdmin.from('fundraising_campaigns').select('id,name,description,goal_amount_cents,deadline,suggested_amounts_cents,is_tax_deductible,slug,org_id').eq('slug',slug).eq('active',true).maybeSingle(),
  ])
  if (event) return NextResponse.json({ type:'event',collection:event })
  if (campaign) {
    const { data: rows } = await supabaseAdmin.from('fundraising_contributions').select('amount_cents,anonymous,contributor_name').eq('campaign_id',campaign.id)
    return NextResponse.json({ type:'fundraising',collection:{...campaign,raised_amount_cents:(rows||[]).reduce((sum,row)=>sum+Number(row.amount_cents||0),0),contributors:(rows||[]).map(row=>({amount_cents:row.amount_cents,name:row.anonymous?'Anonymous':row.contributor_name}))} })
  }
  return NextResponse.json({ error:'Collection not found' },{status:404})
}
