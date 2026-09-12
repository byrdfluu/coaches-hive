export const COACHES_HIVE_SUPABASE_PROJECT_REF = 'fxmxrzhucccneoibksny'

export const assertCoachesHiveSupabaseProject = (url?: string | null) => {
  const value = String(url || '').trim()
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.')
  let projectRef = ''
  try {
    projectRef = new URL(value).hostname.split('.')[0]
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is invalid.')
  }
  if (projectRef !== COACHES_HIVE_SUPABASE_PROJECT_REF) {
    throw new Error(`Supabase project mismatch. Expected ${COACHES_HIVE_SUPABASE_PROJECT_REF}.`)
  }
  return value
}
