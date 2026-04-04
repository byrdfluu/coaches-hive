import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const getIntegrationSettings = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('integration_settings')
    .eq('id', userId)
    .maybeSingle()
  return (data?.integration_settings && typeof data.integration_settings === 'object')
    ? (data.integration_settings as Record<string, any>)
    : {}
}

export const updateIntegrationSettings = async (userId: string, update: Record<string, any>) => {
  const current = await getIntegrationSettings(userId)
  const next = {
    ...current,
    ...update,
    connections: {
      ...(current.connections || {}),
      ...(update.connections || {}),
    },
  }
  await supabaseAdmin
    .from('profiles')
    .update({ integration_settings: next })
    .eq('id', userId)
  return next
}
