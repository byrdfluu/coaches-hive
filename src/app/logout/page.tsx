'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

export default function LogoutPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    const run = async () => {
      await supabase.auth.signOut()
      router.replace('/login')
    }
    run()
  }, [router, supabase])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 text-sm text-[#4a4a4a]">
        Signing you out...
      </div>
    </main>
  )
}
