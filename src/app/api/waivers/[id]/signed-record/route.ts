import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await getSessionRole(['athlete', 'admin', 'org_admin', 'coach'])
  if (error || !session) return error

  const { id: waiverId } = await params
  const userId = session.user.id

  const [{ data: waiver }, { data: signature }] = await Promise.all([
    supabaseAdmin
      .from('org_waivers')
      .select('title, body')
      .eq('id', waiverId)
      .maybeSingle(),
    supabaseAdmin
      .from('waiver_signatures')
      .select('full_name, signed_at, ip_address')
      .eq('waiver_id', waiverId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (!waiver) return jsonError('Waiver not found', 404)
  if (!signature) return jsonError('No signature found for this waiver', 404)

  const signedDate = new Date(signature.signed_at).toLocaleString('en-US', {
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
  <title>Signed Waiver — ${waiver.title}</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #191919; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    .meta { background: #f5f5f5; border: 1px solid #dcdcdc; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .meta p { margin: 4px 0; font-size: 0.9rem; }
    .meta strong { color: #191919; }
    hr { border: none; border-top: 1px solid #dcdcdc; margin: 24px 0; }
    .body { white-space: pre-wrap; font-size: 0.9rem; color: #4a4a4a; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; margin-bottom: 16px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <span class="badge">Signed Record</span>
  <h1>${waiver.title}</h1>
  <div class="meta">
    <p><strong>Signed by:</strong> ${signature.full_name}</p>
    <p><strong>Date:</strong> ${signedDate}</p>
    <p><strong>IP address:</strong> ${signature.ip_address}</p>
  </div>
  <hr />
  <div class="body">${waiver.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
