import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAthleteProfileSelection } from '@/lib/athleteProfiles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('cart')
    .eq('id', session.user.id)
    .maybeSingle()

  return NextResponse.json({ cart: profile?.cart || [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const rawCart = Array.isArray(body?.cart)
    ? body.cart
    : Array.isArray(body?.items)
      ? body.items
      : null

  if (!body || !rawCart) {
    return jsonError('cart must be an array', 400)
  }

  if (rawCart.length > 50) {
    return jsonError('Cart exceeds maximum of 50 items', 400)
  }

  const requestedSubProfileIds: string[] = Array.from(
    new Set(
      rawCart
        .map((item: unknown) =>
          typeof (item as { athlete_profile_id?: unknown })?.athlete_profile_id === 'string'
            ? String((item as { athlete_profile_id?: string }).athlete_profile_id).trim()
            : typeof (item as { sub_profile_id?: unknown })?.sub_profile_id === 'string'
              ? String((item as { sub_profile_id?: string }).sub_profile_id).trim()
            : '',
        )
        .filter((value: string): value is string => value.length > 0),
    ),
  )

  const athleteProfileMap = new Map<string, { athleteProfileId: string; legacySubProfileId: string | null; label: string }>()
  if (requestedSubProfileIds.length > 0) {
    for (const requestedId of requestedSubProfileIds) {
      const { data: selection } = await resolveAthleteProfileSelection({
        supabase: supabaseAdmin,
        ownerUserId: session.user.id,
        athleteProfileId: requestedId,
        subProfileId: requestedId,
      })
      if (selection) {
        athleteProfileMap.set(requestedId, {
          athleteProfileId: selection.athleteProfileId,
          legacySubProfileId: selection.legacySubProfileId,
          label: selection.isPrimary ? 'Primary athlete' : (selection.athleteProfile.full_name || 'Athlete profile'),
        })
      }
    }

    const hasInvalidSubProfile = requestedSubProfileIds.some((id) => !athleteProfileMap.has(id))
    if (hasInvalidSubProfile) {
      return jsonError('Invalid athlete selected for cart item', 403)
    }
  }

  const sanitizedCart = []
  for (const item of rawCart) {
    if (!item || typeof item !== 'object') continue
    const id = typeof item.id === 'string' ? item.id.trim() : null
    const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? Math.min(item.quantity, 99) : null
    const price = typeof item.price === 'number' && item.price >= 0 ? item.price : null
    const requestedAthleteProfileId =
      typeof item.athlete_profile_id === 'string' && item.athlete_profile_id.trim()
        ? item.athlete_profile_id.trim()
        : typeof item.sub_profile_id === 'string' && item.sub_profile_id.trim()
          ? item.sub_profile_id.trim()
        : null
    const athleteSelection = requestedAthleteProfileId ? athleteProfileMap.get(requestedAthleteProfileId) || null : null
    const athleteLabel = athleteSelection
      ? athleteSelection.label
      : typeof item.athlete_label === 'string' && item.athlete_label.trim()
        ? item.athlete_label.trim().slice(0, 100)
        : 'Primary athlete'
    if (!id || quantity === null || price === null) {
      return jsonError('Each cart item must have a valid id, quantity (1–99), and price', 400)
    }
    // Only persist known safe fields
    sanitizedCart.push({
      id,
      quantity,
      price,
      athlete_profile_id: athleteSelection?.athleteProfileId || null,
      sub_profile_id: athleteSelection?.legacySubProfileId || null,
      athlete_label: athleteLabel,
      title: item.title ? String(item.title).slice(0, 200) : undefined,
      creator: item.creator ? String(item.creator).slice(0, 100) : undefined,
      mediaUrl: item.mediaUrl ? String(item.mediaUrl).slice(0, 500) : undefined,
      format: item.format ? String(item.format).slice(0, 80) : undefined,
      duration: item.duration ? String(item.duration).slice(0, 80) : undefined,
      priceLabel: item.priceLabel ? String(item.priceLabel).slice(0, 80) : undefined,
    })
  }

  await supabaseAdmin
    .from('profiles')
    .update({ cart: sanitizedCart })
    .eq('id', session.user.id)

  return NextResponse.json({ ok: true })
}
