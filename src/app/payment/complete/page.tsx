import MobilePaymentCompletion from '@/components/MobilePaymentCompletion'

export const dynamic = 'force-dynamic'

export default async function PaymentCompletePage({ searchParams }: {
  searchParams: Promise<{ token?: string; session_id?: string; type?: string; id?: string; canceled?: string }>
}) {
  const params = await searchParams
  return <MobilePaymentCompletion token={params.token || ''} sessionId={params.session_id || ''} type={params.type || ''} recordId={params.id || ''} canceled={params.canceled === '1'} />
}
