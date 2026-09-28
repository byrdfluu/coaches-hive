import { createStaffPaymentLink, revokeStaffPaymentLinks } from '@/lib/staffFeePaymentLinks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  return createStaffPaymentLink(request, 'organization', (await params).assignmentId)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  return revokeStaffPaymentLinks(request, 'organization', (await params).assignmentId)
}
