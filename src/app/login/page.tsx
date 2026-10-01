import { redirect } from 'next/navigation'

const safeReturnPath = (value?: string) => {
  const candidate = String(value || '').trim()
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : null
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const destination = new URLSearchParams({ reason: 'mobile_only' })
  const from = safeReturnPath(params.next)
  if (from) destination.set('from', from)

  redirect(`/open-app?${destination.toString()}`)
}
