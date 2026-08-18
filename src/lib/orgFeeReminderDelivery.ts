import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendTransactionalEmail } from '@/lib/email'

const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char] || char))
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export async function deliverOrgFeeReminders(reminderIds: string[]) {
  if (!reminderIds.length) return { sent: 0, failed: 0 }
  const { data: reminders } = await supabaseAdmin.from('org_fee_reminders').select('id,assignment_id,message').in('id', reminderIds)
  let sent = 0, failed = 0
  for (const reminder of reminders || []) {
    const { data: assignment } = await supabaseAdmin.from('org_fee_assignments').select('athlete_id,fee_id').eq('id', reminder.assignment_id).maybeSingle()
    if (!assignment) continue
    const [{ data: fee }, { data: recipient }] = await Promise.all([
      supabaseAdmin.from('org_fees').select('title,amount_cents,due_date').eq('id', assignment.fee_id).maybeSingle(),
      supabaseAdmin.from('profiles').select('email,full_name').eq('id', assignment.athlete_id).maybeSingle(),
    ])
    if (!fee || !recipient?.email) continue
    const message = reminder.message || `${fee.title}: ${money(Number(fee.amount_cents))}${fee.due_date ? ` is due ${fee.due_date}` : ' is outstanding'}.`
    const result = await sendTransactionalEmail({
      toEmail: recipient.email, toName: recipient.full_name, subject: `Payment reminder: ${fee.title}`,
      tag: 'payment_reminder', textBody: message,
      htmlBody: `<p>${esc(message)}</p><p><a href="${esc(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://coacheshive.com'}/athlete/payments`)}">View and pay balance</a></p>`,
      metadata: { reminder_id: reminder.id, assignment_id: reminder.assignment_id },
    })
    const wasSent = result.status === 'sent'
    await supabaseAdmin.from('org_fee_reminders').update({
      delivery_status: wasSent ? 'sent' : result.status,
      delivered_at: wasSent ? new Date().toISOString() : null,
      delivery_error: 'error' in result ? result.error : null,
    }).eq('id', reminder.id)
    if (wasSent) sent += 1; else failed += 1
  }
  return { sent, failed }
}
