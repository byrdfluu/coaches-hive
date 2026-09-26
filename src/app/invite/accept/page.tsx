import { redirect } from 'next/navigation'

export default async function InviteAcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const normalizedToken = String(token || '').trim()
  redirect(normalizedToken ? `/signup?invite_token=${encodeURIComponent(normalizedToken)}` : '/signup')
}
