import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { watchInbox } from '@/lib/gmail'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401) }
  }
  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

export async function POST() {
  const { error } = await requireAdmin()
  if (error) return error

  const emailAddress = process.env.GMAIL_SUPPORT_EMAIL
  const topicName = process.env.GMAIL_PUBSUB_TOPIC
  if (!emailAddress || !topicName) {
    return jsonError('Missing GMAIL_SUPPORT_EMAIL or GMAIL_PUBSUB_TOPIC', 400)
  }

  const response = await watchInbox(emailAddress, topicName)
  const config = await getAdminConfig('support')
  await setAdminConfig('support', {
    ...config,
    gmail_history_id: response.historyId,
    gmail_watch_expiration: response.expiration,
  })

  return NextResponse.json({ watch: response })
}
