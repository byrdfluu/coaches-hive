import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const hasServiceRoleConfig = Boolean(supabaseUrl && serviceRoleKey)

const createSupabaseAdmin = () => {
  if (!hasServiceRoleConfig) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

const missingConfigProxy = new Proxy(
  {},
  {
    get() {
      throw new Error('Missing Supabase service role configuration')
    },
  },
) as SupabaseClient

export const supabaseAdmin = createSupabaseAdmin() || missingConfigProxy
export const hasSupabaseAdminConfig = hasServiceRoleConfig
