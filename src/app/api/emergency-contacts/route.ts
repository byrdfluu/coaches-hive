import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET() {
  const { session, role, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const { data, error: queryError } = await supabaseAdmin
    .from('emergency_contacts')
    .select('*')
    .eq('athlete_id', session.user.id)
    .order('contact_index', { ascending: true })

  if (queryError) {
    return jsonError(queryError.message, 500)
  }

  return NextResponse.json({ contacts: data || [] })
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { contacts } = body || {}

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return jsonError('contacts array is required')
  }

  const payload = contacts.slice(0, 2).map((contact, index) => ({
    athlete_id: session.user.id,
    contact_index: index + 1,
    name: contact?.name || null,
    relationship: contact?.relationship || null,
    email: contact?.email || null,
    phone: contact?.phone || null,
  }))

  const { error: upsertError } = await supabaseAdmin
    .from('emergency_contacts')
    .upsert(payload, { onConflict: 'athlete_id,contact_index' })

  if (upsertError) {
    return jsonError(upsertError.message, 500)
  }

  return NextResponse.json({ ok: true })
}
