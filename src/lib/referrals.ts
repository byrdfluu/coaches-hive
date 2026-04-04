import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type RecordReferralStatus =
  | 'recorded'
  | 'already_recorded'
  | 'already_referred'
  | 'missing_code'
  | 'invalid_code'
  | 'self_referral'
  | 'service_unavailable'
  | 'error'

export type RecordReferralResult = {
  ok: boolean
  status: RecordReferralStatus
  referralId?: string | null
  referrerId?: string | null
  message?: string
}

export const isInvalidApiKey = (error: unknown) => {
  const message = typeof error === 'string' ? error : (error as { message?: string })?.message
  return String(message || '').toLowerCase().includes('invalid api key')
}

const normalizeCode = (code?: string | null) => String(code || '').trim().toUpperCase()

export const recordReferralSignup = async ({
  refereeId,
  code,
  role,
}: {
  refereeId: string
  code?: string | null
  role?: string | null
}): Promise<RecordReferralResult> => {
  const normalizedCode = normalizeCode(code)
  if (!normalizedCode) {
    return { ok: false, status: 'missing_code', message: 'code is required' }
  }

  try {
    const { data: codeRow, error: codeError } = await supabaseAdmin
      .from('referral_codes')
      .select('user_id')
      .eq('code', normalizedCode)
      .maybeSingle()

    if (codeError) {
      if (isInvalidApiKey(codeError)) {
        return { ok: false, status: 'service_unavailable', message: 'Referral service is unavailable.' }
      }
      return { ok: false, status: 'error', message: codeError.message }
    }

    if (!codeRow?.user_id) {
      return { ok: false, status: 'invalid_code', message: 'Referral code not found.' }
    }

    if (codeRow.user_id === refereeId) {
      return { ok: false, status: 'self_referral', message: 'You cannot use your own referral code.' }
    }

    const { data: existingRow, error: existingError } = await supabaseAdmin
      .from('referrals')
      .select('id, referrer_id, code')
      .eq('referee_id', refereeId)
      .maybeSingle()

    if (existingError) {
      if (isInvalidApiKey(existingError)) {
        return { ok: false, status: 'service_unavailable', message: 'Referral service is unavailable.' }
      }
      return { ok: false, status: 'error', message: existingError.message }
    }

    if (existingRow?.id) {
      if (existingRow.referrer_id === codeRow.user_id && String(existingRow.code || '').toUpperCase() === normalizedCode) {
        return {
          ok: true,
          status: 'already_recorded',
          referralId: existingRow.id,
          referrerId: codeRow.user_id,
        }
      }
      return {
        ok: true,
        status: 'already_referred',
        referralId: existingRow.id,
        referrerId: existingRow.referrer_id || null,
      }
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('referrals')
      .insert({
        referrer_id: codeRow.user_id,
        referee_id: refereeId,
        code: normalizedCode,
        role: role || null,
        status: 'signed_up',
      })
      .select('id')
      .single()

    if (insertError) {
      const lower = String(insertError.message || '').toLowerCase()
      if (lower.includes('duplicate')) {
        const { data: rowAfterDup } = await supabaseAdmin
          .from('referrals')
          .select('id, referrer_id')
          .eq('referee_id', refereeId)
          .maybeSingle()
        return {
          ok: true,
          status: 'already_recorded',
          referralId: rowAfterDup?.id || null,
          referrerId: rowAfterDup?.referrer_id || codeRow.user_id,
        }
      }
      if (isInvalidApiKey(insertError)) {
        return { ok: false, status: 'service_unavailable', message: 'Referral service is unavailable.' }
      }
      return { ok: false, status: 'error', message: insertError.message }
    }

    return {
      ok: true,
      status: 'recorded',
      referralId: inserted?.id || null,
      referrerId: codeRow.user_id,
    }
  } catch (error) {
    if (isInvalidApiKey(error)) {
      return { ok: false, status: 'service_unavailable', message: 'Referral service is unavailable.' }
    }
    return { ok: false, status: 'error', message: (error as Error)?.message || 'Unexpected referral error.' }
  }
}
