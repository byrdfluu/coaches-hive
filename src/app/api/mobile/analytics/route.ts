import { NextResponse } from 'next/server'
import { requireMobileUser,mobileError } from '@/lib/mobilePaymentApi'
import { captureProductEvent,CLIENT_PRODUCT_EVENTS,type ProductEventName } from '@/lib/productAnalytics'
export async function POST(request:Request){const auth=await requireMobileUser(request);if('response'in auth)return auth.response;const body=await request.json().catch(()=>({})),event=String(body.event||'') as ProductEventName;if(!CLIENT_PRODUCT_EVENTS.has(event))return mobileError('Event is not accepted from clients',403);captureProductEvent(auth.user.id,event,body.properties&&typeof body.properties==='object'?body.properties:{});return NextResponse.json({ok:true})}
