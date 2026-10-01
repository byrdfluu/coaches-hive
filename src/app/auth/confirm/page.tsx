import { redirect } from 'next/navigation'

export default function AuthConfirmFallbackPage() {
  redirect('/open-app?reason=secure_link')
}
