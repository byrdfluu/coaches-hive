import type { Metadata } from 'next'
import SecureMobileCallback from '@/components/SecureMobileCallback'

export const metadata: Metadata = {
  title: 'Accept your Coaches Hive invitation',
  robots: { index: false, follow: false },
}

export default function InviteFallbackPage() {
  return <SecureMobileCallback kind="invitation" />
}
