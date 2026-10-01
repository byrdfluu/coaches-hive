import { redirect } from 'next/navigation'

export default function MobileInviteFallbackPage() {
  redirect('/open-app?reason=invitation')
}
