import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'
import { assertStripeHostedUrl } from '@/lib/paymentSecurity'

export async function POST(request:Request){
  const user=await getMobileRequestUser(request);if(!user)return NextResponse.json({error:'Authentication is required.'},{status:401})
  const body=await request.json().catch(()=>({})),id=parseUuid(body.subscription_id);if(!id)return NextResponse.json({error:'A valid subscription is required.'},{status:422})
  const {data:record}=await supabaseAdmin.from('offering_recurring_subscriptions').select('id,purchaser_user_id,stripe_subscription_id').eq('id',id).eq('purchaser_user_id',user.id).maybeSingle()
  if(!record?.stripe_subscription_id)return NextResponse.json({error:'This subscription cannot be managed yet.'},{status:409})
  const subscription=await stripe.subscriptions.retrieve(record.stripe_subscription_id).catch(()=>null)
  const customer=typeof subscription?.customer==='string'?subscription.customer:subscription?.customer?.id
  if(!customer)return NextResponse.json({error:'The billing account is unavailable.'},{status:409})
  const configuration=process.env.STRIPE_RECURRING_OFFERING_PORTAL_CONFIGURATION_ID||process.env.STRIPE_RECURRING_FEES_PORTAL_CONFIGURATION_ID
  if(!configuration&&process.env.NODE_ENV==='production')return NextResponse.json({error:'Billing management is unavailable.'},{status:503})
  const portal=await stripe.billingPortal.sessions.create({customer,...(configuration?{configuration}:{}),return_url:`${process.env.NEXT_PUBLIC_APP_URL||'https://coacheshive.com'}/athlete/refunds`})
  return NextResponse.json({portal_url:assertStripeHostedUrl(portal.url)})
}
