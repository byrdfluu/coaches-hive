import type { Metadata } from 'next'
import SecureMobileCallback from '@/components/SecureMobileCallback'

export const metadata: Metadata = {
  title: 'Continue securely in Coaches Hive',
  description: 'Complete your secure account action in the Coaches Hive app.',
  robots: { index: false, follow: false },
}

export default function MobileAuthCallbackPage() {
  return <SecureMobileCallback />
}
