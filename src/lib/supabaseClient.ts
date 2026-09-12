import { createClient } from '@supabase/supabase-js'
import { assertCoachesHiveSupabaseProject } from '@/lib/supabaseProject'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.',
  )
}

export const supabase = createClient(assertCoachesHiveSupabaseProject(supabaseUrl), supabaseAnonKey)
