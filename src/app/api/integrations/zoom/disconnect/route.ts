import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { updateIntegrationSettings } from '@/lib/integrationSettings'
export const dynamic = 'force-dynamic'


export async function POST() {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await supabaseAdmin
    .from('user_integrations')
    .delete()
    .eq('user_id', session.user.id)
    .eq('provider', 'zoom')

  const nextSettings = await updateIntegrationSettings(session.user.id, {
    connections: { zoom: { connected: false } },
  })

  return NextResponse.json({ ok: true, integration_settings: nextSettings })
}
