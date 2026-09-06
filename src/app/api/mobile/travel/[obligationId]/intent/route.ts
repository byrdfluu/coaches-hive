import { createCollectionIntent } from '@/lib/orgPaymentCollections'

export const dynamic = 'force-dynamic'
export async function POST(request: Request, { params }: { params: Promise<{ obligationId: string }> }) {
  return createCollectionIntent(request, (await params).obligationId, 'travel')
}
