import { randomBytes, createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['coach', 'assistant_coach']
const RECOVERY_CODE_COUNT = 8

const generateRecoveryCode = () => {
  const raw = randomBytes(4).toString('hex').toUpperCase()
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`
}

const hashRecoveryCode = (code: string) =>
  createHash('sha256').update(code).digest('hex')

export async function POST() {
  const { session, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return error

  const codeSet = new Set<string>()
  while (codeSet.size < RECOVERY_CODE_COUNT) {
    codeSet.add(generateRecoveryCode())
  }
  const codes = Array.from(codeSet)
  const hashedCodes = codes.map(hashRecoveryCode)

  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('coach_security_settings')
    .eq('id', session.user.id)
    .maybeSingle()

  if (profileError) {
    return jsonError(profileError.message, 500)
  }

  const currentSettings =
    profileRow?.coach_security_settings && typeof profileRow.coach_security_settings === 'object'
      ? (profileRow.coach_security_settings as Record<string, unknown>)
      : {}

  const nextSettings = {
    ...currentSettings,
    recovery_codes_hashes: hashedCodes,
    recovery_codes_remaining: hashedCodes.length,
    recovery_codes_generated_at: new Date().toISOString(),
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ coach_security_settings: nextSettings })
    .eq('id', session.user.id)

  if (updateError) {
    return jsonError(updateError.message, 500)
  }

  return NextResponse.json({ codes })
}
