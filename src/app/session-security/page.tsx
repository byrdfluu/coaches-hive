'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

export default function SessionSecurityPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [security, setSecurity] = useState<{
    auth_session_version: number
    force_logout_after: string | null
    suspended: boolean
    suspicious_login: boolean
  } | null>(null)

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    const response = await fetch('/api/auth/session-security')
    if (!response.ok) {
      setNotice('Unable to load session policy.')
      setLoading(false)
      return
    }
    const payload = await response.json()
    setSecurity(payload)
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const runAction = async (action: 'force_logout_all' | 'clear_force_logout') => {
    setNotice('')
    const response = await fetch('/api/auth/session-security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setNotice(payload?.error || 'Unable to update session policy.')
      return
    }
    if (action === 'force_logout_all') {
      router.replace('/login?error=Signed%20out%20from%20all%20sessions')
      return
    }
    setNotice('Session policy updated.')
    await load()
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Security</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Session management</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Manage remembered sessions and forced logout controls.</p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
          >
            Back
          </Link>
        </header>

        <section className="mt-6 glass-card border border-[#191919] bg-white p-6">
          {loading ? <p className="text-sm text-[#6b5f55]">Loading session policy...</p> : null}
          {!loading && security ? (
            <div className="space-y-3 text-sm">
              <p className="text-[#191919]">Session version: {security.auth_session_version}</p>
              <p className="text-[#191919]">Force logout after: {security.force_logout_after || 'Not set'}</p>
              <p className="text-[#191919]">Suspended: {security.suspended ? 'Yes' : 'No'}</p>
              <p className="text-[#191919]">Suspicious login: {security.suspicious_login ? 'Flagged' : 'No'}</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => runAction('force_logout_all')}
                  className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white"
                >
                  Sign out all sessions
                </button>
                <button
                  type="button"
                  onClick={() => runAction('clear_force_logout')}
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                >
                  Clear forced logout
                </button>
              </div>
            </div>
          ) : null}
          {notice ? (
            <p className="mt-4 rounded-lg border border-[#dcdcdc] bg-[#fafafa] px-3 py-2 text-xs text-[#4a4a4a]">
              {notice}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  )
}
