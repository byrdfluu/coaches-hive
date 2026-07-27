import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('mobile parity backend contracts', () => {
  test('booking cancellation and rescheduling are authenticated and authoritative', () => {
    const cancel = source('src/app/api/mobile/bookings/[id]/cancel/route.ts')
    const reschedule = source('src/app/api/mobile/bookings/[id]/reschedule/route.ts')
    const response = source('src/lib/mobileBookingActions.ts')
    for (const route of [cancel, reschedule]) {
      expect(route).toContain('getMobileRequestUser')
      expect(route).toContain('bookingResponse')
      expect(route).toContain('paymentStatus')
      expect(route).toContain('refundStatus')
    }
    expect(response).toContain('released_capacity')
    expect(cancel).not.toContain('stripe.refunds.create')
    const migration = source('supabase/migrations/20260731000000_mobile_parity_backend.sql')
    expect(migration).toContain('cancel_athlete_booking')
    expect(migration).toContain('reschedule_athlete_booking')
  })

  test('support threads accept mobile bearer auth and track unread state', () => {
    const tickets = source('src/app/api/support/tickets/route.ts')
    const messages = source('src/app/api/support/messages/route.ts')
    expect(tickets).toContain('getMobileRequestUser')
    expect(messages).toContain('getMobileRequestUser')
    expect(messages).toContain('increment_support_unread')
    expect(messages).toContain('customer_read_at')
    expect(source('supabase/migrations/20260731000000_mobile_parity_backend.sql'))
      .toContain('reply_to_support_ticket')
  })

  test('organization capabilities resolve membership and configured permissions', () => {
    const route = source('src/app/api/mobile/organizations/[orgId]/capabilities/route.ts')
    expect(route).toContain('organization_memberships')
    expect(route).toContain('org_role_permissions')
    expect(route).toContain('capabilities')
    expect(source('supabase/migrations/20260731000000_mobile_parity_backend.sql'))
      .toContain('organization_mobile_capabilities')
  })

  test('marketplace cancellation creates a reviewable refund request', () => {
    const route = source('src/app/api/mobile/marketplace/orders/[id]/cancel/route.ts')
    expect(route).toContain('payment_refund_requests')
    expect(route).not.toContain('stripe.refunds.create')
    expect(route).toContain("cancellation_status: 'requested'")
    expect(source('supabase/migrations/20260731000000_mobile_parity_backend.sql'))
      .toContain('cancel_marketplace_order')
  })

  test('mobile receipts expose Stripe URLs and Apple transaction records', () => {
    const route = source('src/app/api/mobile/receipts/route.ts')
    expect(route).toContain('receipt_url')
    expect(route).toContain('apple_iap_subscriptions')
    expect(route).toContain('downloadable_record')
  })

  test('superadmin cross-account subscription endpoint remains available', () => {
    const route = source('src/app/api/admin/subscriptions/route.ts')
    expect(route).toContain('isSuperadmin')
    expect(route).toContain("from('platform_subscriptions')")
    expect(route).toContain('user_id')
  })
})
