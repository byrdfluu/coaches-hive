import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET(request: Request) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const url = new URL(request.url)
  const page = url.searchParams.get('page')
  if (!page) return jsonError('page is required')

  const { data, error: queryError } = await supabaseAdmin
    .from('dashboard_layouts')
    .select('hidden_sections')
    .eq('user_id', session.user.id)
    .eq('page', page)
    .maybeSingle()

  if (queryError) {
    return jsonError(queryError.message, 500)
  }

  return NextResponse.json({ hidden_sections: data?.hidden_sections || [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { page, hidden_sections } = body || {}

  if (!page || !Array.isArray(hidden_sections)) {
    return jsonError('page and hidden_sections are required')
  }

  const { error: upsertError } = await supabaseAdmin
    .from('dashboard_layouts')
    .upsert(
      {
        user_id: session.user.id,
        page,
        hidden_sections,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,page' }
    )

  if (upsertError) {
    return jsonError(upsertError.message, 500)
  }

  return NextResponse.json({ ok: true })
}
