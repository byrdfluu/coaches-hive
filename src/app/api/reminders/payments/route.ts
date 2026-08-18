import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendTransactionalEmail } from '@/lib/email'
import { calculateOrgPlatformFeeForOrg } from '@/lib/orgPlatformFees'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import { deliverOrgFeeReminders } from '@/lib/orgFeeReminderDelivery'

export const runtime = 'nodejs'

const authorized = (request: Request) => {
  const secret = process.env.REMINDER_CRON_SECRET || process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('x-reminder-secret') === secret || request.headers.get('authorization') === `Bearer ${secret}`
}
const day = 86_400_000
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / day)
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char] || char))

async function email(to: string, name: string | null, subject: string, message: string, key: string) {
  return sendTransactionalEmail({
    toEmail: to, toName: name, subject, tag: 'payment_reminder',
    textBody: message,
    htmlBody: `<p>${esc(message)}</p><p><a href="${esc(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://coacheshive.com'}/athlete/payments`)}">View payments</a></p>`,
    metadata: { idempotency_key: key },
  })
}

async function run() {
  const now = new Date()
  const horizon = new Date(now.getTime() + 3 * day + 60 * 60 * 1000)
  const { data: legacyAssignments } = await supabaseAdmin.from('org_fee_assignments')
    .select('id,fee_id,athlete_id,status,org_fees(org_id,due_date,title)').eq('status', 'unpaid').limit(1000)
  const legacyReminderIds: string[] = []
  for (const assignment of legacyAssignments || []) {
    const fee = Array.isArray(assignment.org_fees) ? assignment.org_fees[0] : assignment.org_fees
    if (!fee?.due_date) continue
    const due = new Date(`${fee.due_date}T12:00:00.000Z`)
    const until = daysBetween(due, now), past = Math.max(0, daysBetween(now, due))
    const kind = until === 3 ? 'upcoming' : [7,14,30].includes(past) ? `overdue_${past}` : null
    if (!kind) continue
    const idempotencyKey = `org-fee:${assignment.id}:${kind}`
    const { data: created } = await supabaseAdmin.from('org_fee_reminders').upsert({
      fee_id: assignment.fee_id, assignment_id: assignment.id, reminder_type: 'scheduled',
      message: `${fee.title} is ${past ? `${past} days overdue` : 'due in 3 days'}.`, idempotency_key: idempotencyKey,
    }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id').maybeSingle()
    if (created?.id) legacyReminderIds.push(created.id)
  }
  const legacyDelivery = await deliverOrgFeeReminders(legacyReminderIds)
  const { data: eventObligations } = await supabaseAdmin.from('org_event_obligations')
    .select('id,player_id,amount_due_cents,amount_paid_cents,status,org_event_collections(org_id,name,payment_deadline)')
    .in('status',['unpaid','partial']).limit(1000)
  let eventReminders = 0
  for (const obligation of eventObligations || []) {
    const event = Array.isArray(obligation.org_event_collections) ? obligation.org_event_collections[0] : obligation.org_event_collections
    if (!event?.payment_deadline) continue
    const deadline = new Date(event.payment_deadline), until=daysBetween(deadline,now), past=Math.max(0,daysBetween(now,deadline))
    const kind=until===3?'upcoming':[7,14,30].includes(past)?`overdue_${past}`:null
    if(!kind)continue
    const { data: player } = await supabaseAdmin.from('profiles').select('email,full_name').eq('id',obligation.player_id).maybeSingle()
    if(!player?.email)continue
    const reminderKey=`event:${obligation.id}:${kind}`
    const { data: existing }=await supabaseAdmin.from('payment_reminder_deliveries').select('id').eq('idempotency_key',reminderKey).maybeSingle()
    if(existing)continue
    const balance=Math.max(0,Number(obligation.amount_due_cents)-Number(obligation.amount_paid_cents||0))
    const result=await email(player.email,player.full_name,`Event payment ${past?'overdue':'reminder'}`,`${event.name}: ${money(balance)} is ${past?`${past} days overdue`:'due in 3 days'}.`,reminderKey)
    await supabaseAdmin.from('payment_reminder_deliveries').insert({ org_id:event.org_id,user_id:obligation.player_id,source_type:'event_obligation',source_id:obligation.id,reminder_type:kind,recipient_email:player.email,delivery_status:result.status==='sent'?'sent':result.status,delivered_at:result.status==='sent'?new Date().toISOString():null,delivery_error:'error' in result?result.error:null,idempotency_key:reminderKey })
    eventReminders+=1
  }
  const { data: installments, error } = await supabaseAdmin.from('org_dues_installments')
    .select('*, org_dues_schedules(id,title,org_id,team_id,amount_cents)')
    .in('status', ['upcoming','due','past_due','failed']).lte('due_at', horizon.toISOString()).limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let charged = 0, reminders = 0, failures = 0, retries = 0
  for (const installment of installments || []) {
    const schedule = Array.isArray(installment.org_dues_schedules) ? installment.org_dues_schedules[0] : installment.org_dues_schedules
    if (!schedule?.org_id) continue
    const dueAt = new Date(installment.due_at)
    const daysUntil = daysBetween(dueAt, now)
    const daysPast = Math.max(0, daysBetween(now, dueAt))
    const { data: player } = await supabaseAdmin.from('profiles').select('id,email,full_name').eq('id', installment.player_id).maybeSingle()

    const reminderKind = daysUntil === 3 ? 'upcoming' : [7,14,30].includes(daysPast) ? `overdue_${daysPast}` : null
    if (reminderKind && player?.email) {
      const key = `dues:${installment.id}:${reminderKind}`
      const { data: existing } = await supabaseAdmin.from('payment_reminder_deliveries').select('id').eq('idempotency_key', key).maybeSingle()
      if (!existing) {
        const result = await email(player.email, player.full_name, daysPast ? 'Payment overdue' : 'Upcoming team dues',
          `${schedule.title}: ${money(Number(installment.amount_due_cents))} is ${daysPast ? `${daysPast} days overdue` : 'due in 3 days'}.`, key)
        await supabaseAdmin.from('payment_reminder_deliveries').insert({
          org_id: schedule.org_id, user_id: player.id, source_type: 'dues_installment', source_id: installment.id,
          reminder_type: reminderKind, recipient_email: player.email,
          delivery_status: result.status === 'sent' ? 'sent' : result.status,
          delivered_at: result.status === 'sent' ? new Date().toISOString() : null,
          delivery_error: 'error' in result ? result.error : null, idempotency_key: key,
        })
        reminders += 1
      }
    }

    const retry = await supabaseAdmin.from('org_dues_retry_attempts').select('*')
      .eq('installment_id', installment.id).eq('outcome', 'scheduled').lte('scheduled_for', now.toISOString()).order('attempt_number').limit(1).maybeSingle()
    const shouldCharge = installment.autopay && (daysUntil <= 0 && ['upcoming','due','past_due'].includes(installment.status) || Boolean(retry.data))
    if (!shouldCharge || !installment.stripe_customer_id || !installment.stripe_payment_method_id) continue
    const connect = await loadStripeConnectAccountStatus('org', schedule.org_id)
    if (!isStripeConnectEnabled(connect)) continue
    const amountCents = Math.max(0, Number(installment.amount_due_cents) - Number(installment.amount_paid_cents || 0))
    if (!amountCents) continue
    const fees = await calculateOrgPlatformFeeForOrg({ amountCents, orgId: schedule.org_id, kind: 'session' })
    try {
      const intent = await stripe.paymentIntents.create({
        amount: amountCents, currency: 'usd', customer: installment.stripe_customer_id,
        payment_method: installment.stripe_payment_method_id, confirm: true, off_session: true,
        application_fee_amount: fees.platformFeeCents, transfer_data: { destination: connect!.stripeAccountId },
        metadata: {
          source: 'team_dues', transactionType: 'dues', installmentId: installment.id,
          sourceRecordId: installment.id, orgId: schedule.org_id, teamId: schedule.team_id || '',
          playerId: installment.player_id, payerId: installment.family_account_id || installment.player_id,
          title: schedule.title, platformFeeCents: String(fees.platformFeeCents),
          stripeProcessingFeeCents: String(fees.stripeProcessingFeeCents), netAmountCents: String(fees.netCents),
        },
      }, { idempotencyKey: `dues:${installment.id}:attempt:${Number(installment.retry_count || 0)}` })
      await supabaseAdmin.from('org_dues_installments').update({ status: 'processing', stripe_payment_intent_id: intent.id, updated_at: now.toISOString() }).eq('id', installment.id)
      if (retry.data) {
        await supabaseAdmin.from('org_dues_retry_attempts').update({ attempted_at: now.toISOString(), outcome: 'succeeded', stripe_payment_intent_id: intent.id }).eq('id', retry.data.id)
        retries += 1
      }
      charged += 1
    } catch (chargeError) {
      failures += 1
      if (retry.data) await supabaseAdmin.from('org_dues_retry_attempts').update({ attempted_at: now.toISOString(), outcome: 'failed', failure_message: chargeError instanceof Error ? chargeError.message : 'Charge failed' }).eq('id', retry.data.id)
      const nextAttempt = Math.min(Number(retry.data?.attempt_number || installment.retry_count || 0) + 1, 3)
      await supabaseAdmin.from('org_dues_installments').update({ status: 'failed', retry_count: nextAttempt, last_retry_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', installment.id)
      if (nextAttempt <= 3 && Number(retry.data?.attempt_number || 0) < 3) {
        const retryDays = [3,7,14]
        await supabaseAdmin.from('org_dues_retry_attempts').upsert({ installment_id:installment.id,attempt_number:nextAttempt,scheduled_for:new Date(now.getTime()+retryDays[nextAttempt-1]*day).toISOString(),outcome:'scheduled',failure_message:chargeError instanceof Error?chargeError.message:'Charge failed' },{onConflict:'installment_id,attempt_number'})
      }
      if (player?.email) await email(player.email, player.full_name, 'Team dues payment failed', `${schedule.title} could not be charged. Please update your payment method.`, `dues:${installment.id}:failed:${installment.retry_count || 0}`)
      const { data: admins } = await supabaseAdmin.from('organization_memberships').select('user_id').eq('org_id', schedule.org_id).in('role', ['org_admin','school_admin','athletic_director'])
      const ids = (admins || []).map((row) => row.user_id)
      const { data: profiles } = ids.length ? await supabaseAdmin.from('profiles').select('email,full_name').in('id', ids) : { data: [] }
      for (const admin of profiles || []) if (admin.email) await email(admin.email, admin.full_name, 'Family payment failed', `${player?.full_name || 'A player'}: ${schedule.title} payment failed.`, `dues-admin:${installment.id}:failed:${installment.retry_count || 0}:${admin.email}`)
    }
  }
  return NextResponse.json({ charged, reminders: reminders + legacyDelivery.sent + eventReminders, reminder_failures: legacyDelivery.failed, failures, retries, processed: (installments || []).length })
}

export async function GET(request: Request) { return authorized(request) ? run() : NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
export async function POST(request: Request) { return GET(request) }
