'use client'

import { useEffect, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AdminSidebar from '@/components/AdminSidebar'
import { hasAdminPermission, resolveAdminAccess } from '@/lib/adminRoles'

type DebugInfo = {
  sessionRole: string
  userId: string
  email: string
  metadata: Record<string, any> | null
}

type EnvCheck = {
  hasSupabaseUrl: boolean
  supabaseUrlRef: string | null
  hasServiceRoleKey: boolean
  serviceRoleKeyLength: number
  serviceRoleKeyRef: string | null
}

export default function AdminDebugPage() {
  const supabase = createClientComponentClient()
  const [info, setInfo] = useState<DebugInfo | null>(null)
  const [error, setError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null)

  const canMakeAdmin = (() => {
    if (!info?.metadata) return false
    const teamRole = resolveAdminAccess(info.metadata).teamRole
    if (!teamRole) return false
    return hasAdminPermission(teamRole, 'security.manage')
  })()

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        if (active) setError(sessionError.message)
        return
      }
      const session = data.session
      if (!session) {
        if (active) setError('No active session found.')
        return
      }
      if (!active) return
      setInfo({
        sessionRole: session.user.user_metadata?.role || 'missing',
        userId: session.user.id,
        email: session.user.email || '',
        metadata: session.user.user_metadata || null,
      })
    }
    load()
    return () => {
      active = false
    }
  }, [supabase])

  const refreshSession = async () => {
    const { data } = await supabase.auth.getSession()
    const session = data.session
    if (!session) return
    setInfo({
      sessionRole: session.user.user_metadata?.role || 'missing',
      userId: session.user.id,
      email: session.user.email || '',
      metadata: session.user.user_metadata || null,
    })
  }

  const makeAdmin = async () => {
    if (!canMakeAdmin) {
      setActionNotice('You do not have permission to run this action.')
      return
    }
    setActionNotice('Updating role...')
    const response = await fetch('/api/admin/make-admin', { method: 'POST' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setActionNotice(payload.error || 'Unable to update role.')
      return
    }
    setActionNotice('Role updated. Refreshing session...')
    await supabase.auth.refreshSession()
    await refreshSession()
    setActionNotice('Done. Role should now be admin.')
  }

  const checkEnv = async () => {
    const response = await fetch('/api/admin/env-check')
    if (!response.ok) return
    const payload = (await response.json()) as EnvCheck
    setEnvCheck(payload)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div>
            <header>
              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Debug</p>
              <h1 className="display text-3xl font-semibold text-[#191919]">Session status</h1>
              <p className="mt-2 text-sm text-[#6b5f55]">Confirms the current auth session and role.</p>
            </header>

            <div className="mt-6 glass-card border border-[#191919] bg-white p-6 text-sm">
              {error ? (
                <p className="text-[#b80f0a]">{error}</p>
              ) : !info ? (
                <p className="text-[#6b5f55]">Loading session...</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {canMakeAdmin ? (
                      <button
                        className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                        onClick={makeAdmin}
                      >
                        Make me admin
                      </button>
                    ) : (
                      <span className="text-xs text-[#6b5f55]">Make me admin hidden: requires security permission.</span>
                    )}
                    <button
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                      onClick={checkEnv}
                    >
                      Check server env
                    </button>
                    {actionNotice ? (
                      <span className="text-xs text-[#6b5f55]">{actionNotice}</span>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Role</p>
                    <p className="mt-1 text-lg font-semibold text-[#191919]">{info.sessionRole}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">User</p>
                    <p className="mt-1 text-[#191919]">{info.email || 'No email'} · {info.userId}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">User metadata</p>
                    <pre className="mt-2 overflow-x-auto rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#191919]">
{JSON.stringify(info.metadata, null, 2)}
                    </pre>
                  </div>
                  {envCheck ? (
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Server env</p>
                      <pre className="mt-2 overflow-x-auto rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#191919]">
{JSON.stringify(envCheck, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
