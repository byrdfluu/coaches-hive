import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const REQUIRED_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'POSTMARK_SERVER_TOKEN',
  'POSTMARK_FROM_EMAIL',
] as const

const OPTIONAL_ENV_KEYS = [
  'POSTMARK_MESSAGE_STREAM',
  'SUPPORT_EMAIL',
] as const

export async function GET() {
  const { error } = await getSessionRole(['admin', 'superadmin'])
  if (error) return error

  const missingRequired = REQUIRED_ENV_KEYS.filter((key) => !process.env[key])
  const missingOptional = OPTIONAL_ENV_KEYS.filter((key) => !process.env[key])

  if (missingRequired.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'verification email provider misconfigured',
        missing_required: missingRequired,
        missing_optional: missingOptional,
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    provider: 'postmark',
    message: 'verification email provider configured',
    missing_optional: missingOptional,
  })
}
