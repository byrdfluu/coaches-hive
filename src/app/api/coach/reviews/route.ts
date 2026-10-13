import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const { data, error: dbError } = await supabaseAdmin
    .from('coach_reviews')
    .select('id, coach_id, athlete_id, reviewer_name, rating, body, status, verified, coach_response, coach_response_at, created_at')
    .eq('coach_id', user.id)
    .order('created_at', { ascending: false })

  if (dbError) return jsonError(dbError.message, 500)
  return NextResponse.json({
    reviews: (data || []).map((review) => ({
      ...review,
      body: review.body || '',
      status: review.status || 'pending',
      verified: Boolean(review.verified),
    })),
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
