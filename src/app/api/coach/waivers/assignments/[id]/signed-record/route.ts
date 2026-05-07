import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, role, error } = await getSessionRole(['athlete', 'coach', 'admin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const { id } = await params
  const userId = session.user.id

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from('coach_waiver_assignments')
    .select('id, waiver_id, coach_id, athlete_id, signed_at, full_name, ip_address')
    .eq('id', id)
    .maybeSingle()

  if (assignmentError) return jsonError(assignmentError.message, 500)
  if (!assignment) return jsonError('Signed waiver not found', 404)
  if (!assignment.signed_at) return jsonError('No signature found for this waiver', 404)
  if (role !== 'admin' && assignment.athlete_id !== userId && assignment.coach_id !== userId) {
    return jsonError('Forbidden', 403)
  }

  const { data: waiver, error: waiverError } = await supabaseAdmin
    .from('coach_waivers')
    .select('title, body')
    .eq('id', assignment.waiver_id)
    .maybeSingle()

  if (waiverError) return jsonError(waiverError.message, 500)
  if (!waiver) return jsonError('Waiver not found', 404)

  const signedDate = new Date(assignment.signed_at).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signed Waiver - ${escapeHtml(waiver.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #191919; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    .meta { background: #f5f5f5; border: 1px solid #dcdcdc; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .meta p { margin: 4px 0; font-size: 0.9rem; }
    hr { border: none; border-top: 1px solid #dcdcdc; margin: 24px 0; }
    .body { white-space: pre-wrap; font-size: 0.9rem; color: #4a4a4a; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; margin-bottom: 16px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <span class="badge">Signed Record</span>
  <h1>${escapeHtml(waiver.title)}</h1>
  <div class="meta">
    <p><strong>Signed by:</strong> ${escapeHtml(assignment.full_name || 'Athlete')}</p>
    <p><strong>Date:</strong> ${signedDate}</p>
    <p><strong>IP address:</strong> ${escapeHtml(assignment.ip_address || 'Not captured')}</p>
  </div>
  <hr />
  <div class="body">${escapeHtml(waiver.body)}</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
