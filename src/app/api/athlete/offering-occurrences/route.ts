import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { safeOfferingReservationError } from '@/lib/offeringReservations'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const selectionId = String(body.selection_id || '').trim()
  if (!selectionId) return jsonError('Booking selection is required.', 400)
  if (body.action === 'cancel') {
    const { data: creditReturned, error: cancelError } = await (supabase as any).rpc('cancel_family_offering_occurrence', {
      p_selection_id: selectionId, p_reason: String(body.reason || '').trim() || null,
    })
    if (cancelError) return jsonError(cancelError.message || 'Unable to cancel this date.', 409)
    return NextResponse.json({ cancelled: true, credit_returned: Boolean(creditReturned) })
  }
  if (body.action === 'reschedule') {
    const replacementId = String(body.replacement_occurrence_id || '').trim()
    if (!replacementId) return jsonError('Choose a replacement date and time.', 400)
    const { data, error: rescheduleError } = await (supabase as any).rpc('reschedule_family_offering_occurrence', {
      p_selection_id: selectionId, p_new_occurrence_id: replacementId,
      p_reason: String(body.reason || 'Family reschedule').trim(),
    })
    if (rescheduleError) {
      const safe = safeOfferingReservationError(rescheduleError)
      return NextResponse.json({ error: { code: safe.code, message: safe.message, retryable: false } }, { status: safe.status })
    }
    return NextResponse.json({ rescheduled: true, result: Array.isArray(data) ? data[0] : data })
  }
  return jsonError('Unsupported booking action.', 400)
}
