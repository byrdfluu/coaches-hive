import { createOrgCollection, listOrgCollections } from '@/lib/orgPaymentCollections'

export const dynamic = 'force-dynamic'
export const GET = (request: Request) => listOrgCollections(request, 'travel')
export const POST = (request: Request) => createOrgCollection(request, 'travel')
