import { redirect } from 'next/navigation'

export default function AuthInviteFallbackPage() {
  redirect('/open-app?reason=invitation')
}
