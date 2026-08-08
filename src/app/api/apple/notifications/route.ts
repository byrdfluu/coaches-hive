import { NextResponse } from 'next/server'
import {
  persistAppleSubscription,
  statusFromAppleNotification,
  verifyAppleNotification,
  verifyAppleRenewalInfo,
  verifyAppleTransactionForEnvironment,
} from '@/lib/appleIap'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const signedPayload = typeof body?.signedPayload === 'string' ? body.signedPayload.trim() : ''
  if (!signedPayload) return NextResponse.json({ error: 'signedPayload is required' }, { status: 400 })

  let notificationUUID: string | null = null
  try {
    const verified = await verifyAppleNotification(signedPayload)
    const notification = verified.payload
    notificationUUID = notification.notificationUUID || null
    if (!notificationUUID) throw new Error('Apple notification UUID is missing')

    const { error: insertError } = await supabaseAdmin
      .from('app_store_server_notifications')
      .insert({
        notification_uuid: notificationUUID,
        notification_type: notification.notificationType || null,
        subtype: notification.subtype || null,
        environment: notification.data?.environment || verified.environment,
        signed_date: notification.signedDate
          ? new Date(notification.signedDate).toISOString()
          : null,
        status: 'processing',
      })
    if (insertError?.code === '23505') {
      const { data: existing } = await supabaseAdmin
        .from('app_store_server_notifications')
        .select('status')
        .eq('notification_uuid', notificationUUID)
        .maybeSingle()
      if (existing?.status !== 'failed') return NextResponse.json({ received: true })
      const { error: retryError } = await supabaseAdmin
        .from('app_store_server_notifications')
        .update({ status: 'processing', last_error: null })
        .eq('notification_uuid', notificationUUID)
      if (retryError) throw new Error(retryError.message)
    }
    if (insertError) throw new Error(insertError.message)

    const signedTransaction = notification.data?.signedTransactionInfo
    if (!signedTransaction) {
      await supabaseAdmin
        .from('app_store_server_notifications')
        .update({ status: 'ignored', processed_at: new Date().toISOString() })
        .eq('notification_uuid', notificationUUID)
      return NextResponse.json({ received: true })
    }

    const transaction = await verifyAppleTransactionForEnvironment(signedTransaction, verified.environment)
    const renewal = notification.data?.signedRenewalInfo
      ? await verifyAppleRenewalInfo(notification.data.signedRenewalInfo, verified.environment)
      : null
    if (!transaction.originalTransactionId) throw new Error('Original transaction ID is missing')

    const { data: appleSubscription, error: ownerError } = await supabaseAdmin
      .from('apple_iap_subscriptions')
      .select('user_id, owner_type, plan_key, workspace_id')
      .eq('original_transaction_id', transaction.originalTransactionId)
      .maybeSingle()
    if (ownerError) throw new Error(ownerError.message)
    if (!appleSubscription?.user_id) {
      await supabaseAdmin
        .from('app_store_server_notifications')
        .update({
          original_transaction_id: transaction.originalTransactionId,
          status: 'ignored',
          processed_at: new Date().toISOString(),
        })
        .eq('notification_uuid', notificationUUID)
      return NextResponse.json({ received: true })
    }
    const product = transaction.productId
      ? {
          coach: transaction.productId.startsWith('com.coacheshive.mobile.coachallaccess.'),
          family: transaction.productId.startsWith('com.coacheshive.mobile.familyallaccess.'),
        }
      : null
    if (
      !product
      || (appleSubscription.owner_type === 'coach' && !product.coach)
      || (appleSubscription.owner_type === 'athlete' && !product.family)
      || (appleSubscription.plan_key === 'coach_all_access' && !product.coach)
      || (appleSubscription.plan_key === 'family_all_access' && !product.family)
    ) {
      throw new Error('Apple renewal product does not match the bound subscription owner')
    }

    const status = statusFromAppleNotification({
      notificationType: String(notification.notificationType || ''),
      subscriptionStatus: notification.data?.status,
      transaction,
    })
    await persistAppleSubscription({
      userId: appleSubscription.user_id,
      transaction,
      renewal,
      status,
    })
    await supabaseAdmin
      .from('app_store_server_notifications')
      .update({
        original_transaction_id: transaction.originalTransactionId,
        workspace_id: appleSubscription.workspace_id || null,
        status: 'processed',
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('notification_uuid', notificationUUID)

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[apple/notifications] processing failed', error)
    if (notificationUUID) {
      await supabaseAdmin
        .from('app_store_server_notifications')
        .update({
          status: 'failed',
          last_error: error instanceof Error ? error.message : 'Notification processing failed',
        })
        .eq('notification_uuid', notificationUUID)
    }
    return NextResponse.json({ error: 'Invalid App Store notification' }, { status: 400 })
  }
}
