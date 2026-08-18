import { NextResponse } from 'next/server'
import { mobileError,requireMobileUser } from '@/lib/mobilePaymentApi'
import { resolvePortalCapabilities } from '@/lib/portalCapabilities'
export async function GET(request:Request){const auth=await requireMobileUser(request);if('response'in auth)return auth.response;const url=new URL(request.url),document=await resolvePortalCapabilities(auth.user.id,request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id'),url.searchParams.get('org_id'));return document?NextResponse.json(document):mobileError('No portal capabilities are available',403)}
