import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const LEGACY_TRAINING_PURCHASE_DISABLED = 'LEGACY_TRAINING_PACKAGE_PURCHASE_DISABLED'

export async function legacyTrainingMigration(legacyPackageId: string, organizationId?: string) {
  let query = (supabaseAdmin as any)
    .from('legacy_training_package_migrations')
    .select('legacy_package_id,unified_program_id,org_id,migration_status,migrated_at')
    .eq('legacy_package_id', legacyPackageId)
  if (organizationId) query = query.eq('org_id', organizationId)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data || null
}

export function legacyTrainingRedirect(programId: string | null | undefined) {
  return programId ? `/athlete/programs?offering_id=${encodeURIComponent(programId)}` : '/athlete/programs'
}
