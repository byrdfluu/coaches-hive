'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AdminSidebar from '@/components/AdminSidebar'
import Toast from '@/components/Toast'

type Integration = {
  configured: boolean
  [key: string]: unknown
}

type SettingsPayload = {
  integrations: {
    supabase: { configured: boolean; project_ref: string | null }
    stripe: { configured: boolean; mode: string | null; webhook_configured: boolean; connect_configured: boolean }
    postmark: { configured: boolean; from_email: string | null; sandbox_override: string | null }
    sentry: { configured: boolean }
    google_oauth: { configured: boolean }
    zoom: { configured: boolean }
  }
  flags: Array<{ key: string; value: boolean; label: string; description: string }>
  notification_rules: Array<{ event: string; status: string }>
}

type SessionInfo = {
  email: string
  userId: string
  role: string
  teamRole: string | null
}

const Badge = ({ ok, label }: { ok: boolean; label?: string }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      ok ? 'bg-[#e6f4ea] text-[#1a7f3c]' : 'bg-[#fdecea] text-[#b80f0a]'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-[#1a7f3c]' : 'bg-[#b80f0a]'}`} />
    {label || (ok ? 'Configured' : 'Not configured')}
  </span>
)

const SectionHeader = ({ title, description }: { title: string; description?: string }) => (
  <div className="mb-4">
    <h2 className="text-lg font-semibold text-[#191919]">{title}</h2>
    {description && <p className="mt-0.5 text-sm text-[#4a4a4a]">{description}</p>}
  </div>
)

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-3 border-b border-[#f0f0f0] last:border-0">
    <span className="text-sm text-[#191919]">{label}</span>
    <div className="flex items-center gap-2">{children}</div>
  </div>
)

export default function AdminSettingsPage() {
  const supabase = createClientComponentClient()
  const [settings, setSettings] = useState<SettingsPayload | null>(null)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingFlag, setSavingFlag] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/admin/settings')
    if (!res.ok) return
    const data = await res.json()
    setSettings(data)
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data } = await supabase.auth.getSession()
      const s = data.session
      if (s) {
        setSession({
          email: s.user.email || '',
          userId: s.user.id,
          role: s.user.user_metadata?.role || '—',
          teamRole: s.user.user_metadata?.admin_team_role || null,
        })
      }
      await loadSettings()
      setLoading(false)
    }
    load()
  }, [supabase, loadSettings])

  const toggleFlag = async (key: string, current: boolean) => {
    setSavingFlag(key)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: !current }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      if (data?.error?.includes('migration')) setMigrationNeeded(true)
      setToast(data?.error || 'Failed to update flag.')
    } else {
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              flags: prev.flags.map((f) =>
                f.key === key ? { ...f, value: !current } : f
              ),
            }
          : prev
      )
      setToast('Setting saved.')
    }
    setSavingFlag(null)
  }

  const integrations = settings?.integrations

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <header>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Admin</p>
              <h1 className="display text-3xl font-semibold text-[#191919]">Platform settings</h1>
              <p className="mt-2 text-sm text-[#4a4a4a]">
                Integration health, feature flags, and superadmin account info.
              </p>
            </header>

            {loading ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">Loading…</div>
            ) : (
              <>
                {/* Superadmin account */}
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <SectionHeader title="Superadmin account" description="Your current session details." />
                  <div className="space-y-0 divide-y divide-[#f0f0f0] text-sm">
                    <Row label="Email">{session?.email || '—'}</Row>
                    <Row label="User ID">
                      <code className="rounded bg-[#f5f5f5] px-2 py-0.5 text-xs text-[#191919]">
                        {session?.userId || '—'}
                      </code>
                    </Row>
                    <Row label="Role">
                      <Badge ok={true} label={session?.role || '—'} />
                      {session?.teamRole && (
                        <Badge ok={true} label={session.teamRole} />
                      )}
                    </Row>
                  </div>
                </section>

                {/* Integrations */}
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <SectionHeader
                    title="Integrations"
                    description="Configuration status for all external services. Secrets are never shown."
                  />
                  <div className="grid gap-4 sm:grid-cols-2">

                    {/* Supabase */}
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#191919]">Supabase</p>
                        <Badge ok={integrations?.supabase.configured ?? false} />
                      </div>
                      {integrations?.supabase.project_ref && (
                        <p className="text-xs text-[#4a4a4a]">Project: <code className="font-mono">{integrations.supabase.project_ref}</code></p>
                      )}
                    </div>

                    {/* Stripe */}
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#191919]">Stripe</p>
                        <Badge ok={integrations?.stripe.configured ?? false} />
                      </div>
                      {integrations?.stripe.configured && (
                        <div className="flex flex-wrap gap-1.5">
                          <Badge ok={integrations.stripe.webhook_configured} label="Webhook" />
                          <Badge ok={integrations.stripe.connect_configured} label="Connect" />
                        </div>
                      )}
                    </div>

                    {/* Postmark */}
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#191919]">Postmark</p>
                        <Badge ok={integrations?.postmark.configured ?? false} />
                      </div>
                      {integrations?.postmark.configured && (
                        <p className="text-xs text-[#4a4a4a]">
                          From: <span className="font-mono">{integrations.postmark.from_email}</span>
                        </p>
                      )}
                    </div>

                    {/* Sentry */}
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#191919]">Sentry</p>
                        <Badge ok={integrations?.sentry.configured ?? false} />
                      </div>
                      {!integrations?.sentry.configured && (
                        <p className="text-xs text-[#4a4a4a]">Set SENTRY_AUTH_TOKEN and SENTRY_ORG_SLUG to enable error tracking.</p>
                      )}
                    </div>

                    {/* Google OAuth */}
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#191919]">Google OAuth</p>
                        <Badge ok={integrations?.google_oauth.configured ?? false} />
                      </div>
                    </div>

                    {/* Zoom */}
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#191919]">Zoom</p>
                        <Badge ok={integrations?.zoom.configured ?? false} />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Feature flags */}
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <SectionHeader
                    title="Feature flags"
                    description="Stored in the platform_settings table. Toggle changes take effect immediately."
                  />
                  {migrationNeeded && (
                    <div className="mb-4 rounded-2xl border border-[#b80f0a] bg-[#fff6f5] p-4 text-sm text-[#b80f0a]">
                      <p className="font-semibold">Migration required</p>
                      <p className="mt-1">Run this in the Supabase SQL editor before toggling flags:</p>
                      <pre className="mt-2 overflow-x-auto rounded bg-white p-3 text-xs text-[#191919]">{`CREATE TABLE IF NOT EXISTS platform_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT 'null',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);`}</pre>
                    </div>
                  )}
                  <div className="divide-y divide-[#f0f0f0]">
                    {(settings?.flags || []).map((flag) => (
                      <div key={flag.key} className="flex items-center justify-between gap-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-[#191919]">{flag.label}</p>
                          <p className="text-xs text-[#4a4a4a]">{flag.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleFlag(flag.key, flag.value)}
                          disabled={savingFlag === flag.key}
                          aria-pressed={flag.value}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            flag.value ? 'bg-[#191919]' : 'bg-[#dcdcdc]'
                          } ${savingFlag === flag.key ? 'opacity-50' : ''}`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                              flag.value ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Notification rules */}
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <SectionHeader
                    title="Notification rules"
                    description="Transactional emails wired in the platform. All use Postmark."
                  />
                  <div className="divide-y divide-[#f0f0f0] text-sm">
                    {(settings?.notification_rules || []).map((rule) => (
                      <div key={rule.event} className="flex items-center justify-between gap-4 py-2.5">
                        <span className="text-[#191919]">{rule.event}</span>
                        <Badge ok={rule.status === 'Active'} label={rule.status} />
                      </div>
                    ))}
                  </div>
                </section>

                {/* Security */}
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <SectionHeader
                    title="Security"
                    description="Quick links to security-related admin tools."
                  />
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Link
                      href="/admin/audit"
                      className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#f5f5f5]"
                    >
                      Audit log
                    </Link>
                    <Link
                      href="/admin/debug"
                      className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#f5f5f5]"
                    >
                      Session debug
                    </Link>
                    <Link
                      href="/admin/verifications"
                      className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#f5f5f5]"
                    >
                      Identity verifications
                    </Link>
                    <Link
                      href="/admin/users"
                      className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#f5f5f5]"
                    >
                      User management
                    </Link>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
