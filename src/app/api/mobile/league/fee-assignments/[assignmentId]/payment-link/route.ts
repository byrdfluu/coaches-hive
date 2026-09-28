import { createStaffPaymentLink, revokeStaffPaymentLinks } from '@/lib/staffFeePaymentLinks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  return createStaffPaymentLink(request, 'league', (await params).assignmentId)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  return revokeStaffPaymentLinks(request, 'league', (await params).assignmentId)
}
