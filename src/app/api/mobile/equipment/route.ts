import { listPayerCollections } from '@/lib/orgPaymentCollections'

export const dynamic = 'force-dynamic'
export const GET = (request: Request) => listPayerCollections(request, 'equipment')
