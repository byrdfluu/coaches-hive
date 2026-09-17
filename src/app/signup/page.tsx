import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Continue in the Coaches Hive app',
  robots: { index: false, follow: false },
}

export default async function SignupRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const incoming = await searchParams
  const preserved = new URLSearchParams()
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) value.forEach(item => preserved.append(key, item))
    else if (value) preserved.set(key, value)
  }
  const originalDestination = `/signup${preserved.size ? `?${preserved.toString()}` : ''}`
  redirect(`/open-app?${new URLSearchParams({ from: originalDestination, reason: 'web_signup_paused' })}`)
}
