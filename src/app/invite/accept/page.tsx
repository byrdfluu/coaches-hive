import { redirect } from 'next/navigation'

export default async function InviteAcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const normalizedToken = String(token || '').trim()
  const invitationPath = normalizedToken
    ? `/invite/accept?token=${encodeURIComponent(normalizedToken)}`
    : '/invite'
  redirect(`/open-app?${new URLSearchParams({ from: invitationPath, reason: 'invitation' })}`)
}
