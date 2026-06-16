import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PUB_ID = 'pub_f7a5a8ff-f500-4913-9bef-95437b544966'

const VALID_ROLES = new Set(['org', 'coach', 'athlete'])

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body?.role === 'string' ? body.role.trim().toLowerCase() : ''

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json({ error: 'Role must be org, coach, or athlete.' }, { status: 400 })
  }

  const res = await fetch(`https://api.beehiiv.com/v2/publications/${PUB_ID}/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.BEEHIIV_API_KEY}`,
    },
    body: JSON.stringify({
      email,
      reactivate_existing: true,
      send_welcome_email: false,
      custom_fields: [{ name: 'waitlist_role', value: role }],
      tags: [`waitlist`, `waitlist_${role}`],
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Could not join waitlist. Try again.' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
