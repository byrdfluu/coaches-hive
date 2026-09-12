import { supabaseAdmin } from '@/lib/supabaseAdmin'

const PERMANENT_PROTECTED_EMAILS = new Set([
  'byrdjuwan7@gmail.com',
])

const configuredProtectedEmails = () => String(process.env.PROTECTED_OWNER_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

export const isProtectedOwnerEmail = (email?: string | null) => {
  const normalized = String(email || '').trim().toLowerCase()
  return Boolean(normalized) && (
    PERMANENT_PROTECTED_EMAILS.has(normalized)
    || configuredProtectedEmails().includes(normalized)
  )
}

export const isProtectedOwnerUserId = async (userId?: string | null) => {
  if (!userId) return false
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  return isProtectedOwnerEmail(data?.user?.email)
}
