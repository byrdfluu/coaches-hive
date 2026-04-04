import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isInvalidApiKey, recordReferralSignup } from '@/lib/referrals'
import { getSessionRoleState } from '@/lib/sessionRoleState'
export const dynamic = 'force-dynamic'


type ReferralRow = {
  id: string
  referee_id: string | null
  status: string
  created_at: string
}

const generateCode = () => {
  const segment = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `CH${segment}`
}

const ensureReferralCode = async (userId: string): Promise<string | null> => {
  try {
    const { data: existing, error: selectError } = await supabaseAdmin
      .from('referral_codes')
      .select('code')
      .eq('user_id', userId)
      .maybeSingle()
    if (selectError) {
      if (isInvalidApiKey(selectError)) return null
      throw selectError
    }
    if (existing?.code) return existing.code

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateCode()
      const { data, error } = await supabaseAdmin
        .from('referral_codes')
        .insert({ user_id: userId, code })
        .select('code')
        .single()
      if (!error && data?.code) return data.code
      if (error && String(error.message || '').toLowerCase().includes('duplicate')) {
        continue
      }
      if (error) {
        if (isInvalidApiKey(error)) return null
        throw error
      }
    }
    console.warn('Unable to generate referral code after several attempts.')
    return null
  } catch (ensureError) {
    if (!isInvalidApiKey(ensureError)) {
      console.error('Unable to ensure referral code:', ensureError)
    }
    return null
  }
}

export async function GET() {
  const { session, error } = await getSessionRole([
    'athlete',
    'coach',
    'admin',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error

  const code = await ensureReferralCode(session.user.id)
  if (!code) {
    return NextResponse.json({
      code: null,
      total: 0,
      recent: [],
      unavailable: true,
    })
  }
  let referrals: ReferralRow[] = []
  try {
    const { data: referralRows, error: referralError } = await supabaseAdmin
      .from('referrals')
      .select('id, referee_id, status, created_at')
      .eq('referrer_id', session.user.id)
      .order('created_at', { ascending: false })
    if (referralError) {
      if (!isInvalidApiKey(referralError)) {
        console.error('Unable to load referrals:', referralError)
      }
    } else {
      referrals = (referralRows || []) as ReferralRow[]
    }
  } catch (referralsError) {
    if (!isInvalidApiKey(referralsError)) {
      console.error('Unable to load referrals:', referralsError)
    }
  }

  const recent = referrals.slice(0, 5)

  return NextResponse.json({
    code,
    total: referrals.length,
    recent,
    unavailable: false,
  })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole([
    'athlete',
    'coach',
    'admin',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error

  try {
    const body = await request.json().catch(() => null)
    const code = (body?.code || '').trim().toUpperCase()
    if (!code) return jsonError('code is required', 400)

    const result = await recordReferralSignup({
      refereeId: session.user.id,
      code,
      role: getSessionRoleState(session.user.user_metadata).currentRole || '',
    })

    if (result.status === 'service_unavailable') {
      return jsonError(result.message || 'Referral service is unavailable.', 503)
    }
    if (result.status === 'invalid_code') {
      return jsonError(result.message || 'Referral code not found.', 404)
    }
    if (result.status === 'self_referral') {
      return jsonError(result.message || 'You cannot use your own referral code.', 400)
    }
    if (!result.ok && result.status !== 'already_recorded' && result.status !== 'already_referred') {
      return jsonError(result.message || 'Unable to process referral.', 500)
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      referral_id: result.referralId || null,
    })
  } catch (postError) {
    if (!isInvalidApiKey(postError)) {
      console.error('Unable to process referral:', postError)
    }
    return jsonError('Referral service currently unavailable.', 503)
  }
}
