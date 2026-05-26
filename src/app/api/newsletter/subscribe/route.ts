import { NextResponse } from 'next/server'

const PUB_ID = 'pub_f7a5a8ff-f500-4913-9bef-95437b544966'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const res = await fetch(`https://api.beehiiv.com/v2/publications/${PUB_ID}/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.BEEHIIV_API_KEY}`,
    },
    body: JSON.stringify({
      email,
      reactivate_existing: false,
      send_welcome_email: true,
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Could not subscribe. Try again.' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
