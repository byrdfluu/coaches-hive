import { NextResponse } from 'next/server'
import { createCanonicalPaymentIntent } from '@/lib/canonicalPaymentIntent'
import {
  mobileError,
  money,
  requireIdempotencyKey,
  requireMobileOrgAuthority,
  requireMobileUser,
  teamBelongsToOrg,
  userCanAccessPlayer,
} from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { TransactionType } from '@/lib/paymentLedger'

export type CollectionType = Extract<TransactionType, 'equipment' | 'travel'>

export async function listOrgCollections(request: Request, collectionType: CollectionType) {
  const authority = await requireMobileOrgAuthority(request)
  if ('response' in authority) return authority.response
  const { data: collections, error } = await supabaseAdmin
    .from('org_payment_collections')
    .select('*')
    .eq('org_id', authority.orgId)
    .eq('collection_type', collectionType)
    .order('created_at', { ascending: false })
  if (error) return mobileError(error.message, 500)
  const ids = (collections || []).map((row) => row.id)
  const { data: obligations, error: obligationsError } = ids.length
    ? await supabaseAdmin.from('org_payment_collection_obligations').select('*').in('collection_id', ids)
    : { data: [], error: null }
  if (obligationsError) return mobileError(obligationsError.message, 500)
  return NextResponse.json({ collections: collections || [], obligations: obligations || [] })
}

export async function createOrgCollection(request: Request, collectionType: CollectionType) {
  const authority = await requireMobileOrgAuthority(request)
  if ('response' in authority) return authority.response
  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  const amountCents = money(body.amount_cents)
  if (!title || amountCents <= 0) return mobileError('title and positive amount_cents are required')
  if (!(await teamBelongsToOrg(body.team_id, authority.orgId))) {
    return mobileError('Team does not belong to this organization', 403)
  }

  let playerIds = Array.isArray(body.player_ids)
    ? Array.from(new Set<string>(body.player_ids.map(String).filter(Boolean)))
    : []
  if (!playerIds.length && body.team_id) {
    const { data } = await supabaseAdmin.from('org_team_members').select('athlete_id').eq('team_id', body.team_id)
    playerIds = Array.from(new Set((data || []).map((row) => String(row.athlete_id)).filter(Boolean)))
  }
  if (!playerIds.length) return mobileError('At least one organization player is required')
  const { data: members, error: memberError } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', authority.orgId)
    .eq('status', 'active')
    .in('user_id', playerIds)
  if (memberError) return mobileError(memberError.message, 500)
  if (new Set((members || []).map((row) => row.user_id)).size !== playerIds.length) {
    return mobileError('Every player must belong to this organization', 403)
  }

  const { data: collection, error } = await supabaseAdmin.from('org_payment_collections').insert({
    org_id: authority.orgId,
    team_id: body.team_id || null,
    collection_type: collectionType,
    title,
    description: String(body.description || '').trim() || null,
    amount_cents: amountCents,
    due_at: body.due_at || null,
    created_by: authority.user.id,
  }).select('*').single()
  if (error) return mobileError(error.message, 500)

  const { data: obligations, error: obligationError } = await supabaseAdmin
    .from('org_payment_collection_obligations')
    .insert(playerIds.map((playerId) => ({
      collection_id: collection.id,
      player_id: playerId,
      amount_due_cents: amountCents,
    })))
    .select('*')
  if (obligationError) {
    await supabaseAdmin.from('org_payment_collections').delete().eq('id', collection.id)
    return mobileError(obligationError.message, 500)
  }
  return NextResponse.json({ collection, obligations: obligations || [] }, { status: 201 })
}

export async function listPayerCollections(request: Request, collectionType: CollectionType) {
  const auth = await requireMobileUser(request)
  if ('response' in auth) return auth.response
  const { data, error } = await supabaseAdmin
    .from('org_payment_collection_obligations')
    .select('*,org_payment_collections!inner(*)')
    .or(`player_id.eq.${auth.user.id},family_account_id.eq.${auth.user.id}`)
    .eq('org_payment_collections.collection_type', collectionType)
    .eq('org_payment_collections.active', true)
    .order('created_at', { ascending: false })
  if (error) return mobileError(error.message, 500)
  return NextResponse.json({ obligations: data || [] })
}

export async function createCollectionIntent(
  request: Request,
  obligationId: string,
  collectionType: CollectionType,
) {
  const auth = await requireMobileUser(request)
  if ('response' in auth) return auth.response
  const body = await request.json().catch(() => ({}))
  const idempotencyKey = requireIdempotencyKey(body)
  if (!idempotencyKey) return mobileError('idempotency_key is required and must contain at least 8 characters')
  const { data: obligation, error } = await supabaseAdmin
    .from('org_payment_collection_obligations')
    .select('*,org_payment_collections!inner(*)')
    .eq('id', obligationId)
    .eq('org_payment_collections.collection_type', collectionType)
    .eq('org_payment_collections.active', true)
    .maybeSingle()
  if (error) return mobileError(error.message, 500)
  const collection = Array.isArray(obligation?.org_payment_collections)
    ? obligation.org_payment_collections[0]
    : obligation?.org_payment_collections
  if (!obligation || !collection) return mobileError(`${collectionType} obligation not found`, 404)
  if (!(await userCanAccessPlayer(auth.user.id, obligation.player_id))) return mobileError('Forbidden', 403)
  const remaining = Math.max(0, Number(obligation.amount_due_cents) - Number(obligation.amount_paid_cents || 0))
  if (remaining <= 0) return mobileError('This obligation is already paid', 409)

  try {
    return NextResponse.json(await createCanonicalPaymentIntent({
      userId: auth.user.id,
      idempotencyKey,
      transactionType: collectionType,
      sourceRecordType: `org_${collectionType}_obligation`,
      sourceRecordId: obligation.id,
      amountCents: remaining,
      description: collection.title,
      orgId: collection.org_id,
      payerId: auth.user.id,
      playerId: obligation.player_id,
      teamId: collection.team_id,
      metadata: {
        collectionId: collection.id,
        collectionObligationId: obligation.id,
      },
    }))
  } catch (error) {
    return mobileError(error instanceof Error ? error.message : 'Unable to create payment', 409)
  }
}
