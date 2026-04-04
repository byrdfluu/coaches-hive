'use client'

import { useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'

export default function AdminAutomationsPage() {
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [onboardingFlows, setOnboardingFlows] = useState<Array<{ id: string; title: string; trigger: string; touchpoints: string; status: string }>>([])
  const [retentionAutomations, setRetentionAutomations] = useState<Array<{ id: string; title: string; trigger: string; cadence: string; status: string }>>([])
  const [scheduledRuns, setScheduledRuns] = useState<Array<{ id: string; name: string; nextRun: string; audience: string; lastRun?: string | null }>>([])
  const [alertingRules, setAlertingRules] = useState<string[]>([])

  const updateFlowStatus = (flowId: string, status: string, type: 'onboarding' | 'retention') => {
    if (type === 'onboarding') {
      setOnboardingFlows((prev) => prev.map((flow) => (flow.id === flowId ? { ...flow, status } : flow)))
      return
    }
    setRetentionAutomations((prev) => prev.map((flow) => (flow.id === flowId ? { ...flow, status } : flow)))
  }

  const handleSave = async () => {
    setSaving(true)
    const response = await fetch('/api/admin/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          onboardingFlows,
          retentionAutomations,
          scheduledRuns,
          alertingRules,
        },
      }),
    })
    if (!response.ok) {
      setToast('Unable to save automations.')
      setSaving(false)
      return
    }
    setToast('Automations saved.')
    setSaving(false)
  }

  const handleRun = async (runId: string) => {
    const response = await fetch('/api/admin/automations/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId }),
    })
    if (!response.ok) {
      setToast('Unable to run automation.')
      return
    }
    const payload = await response.json()
    if (payload?.config?.scheduledRuns) {
      setScheduledRuns(payload.config.scheduledRuns)
    }
    setToast('Automation run logged.')
  }

  useEffect(() => {
    let active = true
    const loadAutomations = async () => {
      setLoading(true)
      const response = await fetch('/api/admin/automations')
      if (!response.ok) {
        setToast('Unable to load automations.')
        setLoading(false)
        return
      }
      const payload = await response.json()
      if (!active) return
      setOnboardingFlows(payload.config?.onboardingFlows || [])
      setRetentionAutomations(payload.config?.retentionAutomations || [])
      setScheduledRuns(payload.config?.scheduledRuns || [])
      setAlertingRules(payload.config?.alertingRules || [])
      setLoading(false)
    }
    loadAutomations()
    return () => {
      active = false
    }
  }, [])
  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Onboarding + retention automations</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Automated journeys, triggers, and cadence tracking.</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            {loading ? <LoadingState label="Loading automations..." /> : null}
            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Onboarding journeys</h2>
              <p className="mt-1 text-sm text-[#6b5f55]">Progressive steps to get users activated.</p>
              <div className="mt-4 space-y-3 text-sm">
                {onboardingFlows.map((flow) => (
                  <div key={flow.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{flow.title}</p>
                        <p className="text-xs text-[#6b5f55]">Trigger: {flow.trigger}</p>
                      </div>
                      <select
                        value={flow.status}
                        onChange={(event) => updateFlowStatus(flow.id, event.target.value, 'onboarding')}
                        className="rounded-full border border-[#191919] bg-white px-3 py-1 text-xs font-semibold text-[#191919]"
                      >
                        <option value="Active">Active</option>
                        <option value="Paused">Paused</option>
                        <option value="Draft">Draft</option>
                      </select>
                    </div>
                    <p className="mt-2 text-xs text-[#6b5f55]">{flow.touchpoints}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Retention automations</h2>
              <p className="mt-1 text-sm text-[#6b5f55]">Reduce churn with proactive nudges.</p>
              <div className="mt-4 space-y-3 text-sm">
                {retentionAutomations.map((flow) => (
                  <div key={flow.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{flow.title}</p>
                        <p className="text-xs text-[#6b5f55]">Trigger: {flow.trigger}</p>
                      </div>
                      <select
                        value={flow.status}
                        onChange={(event) => updateFlowStatus(flow.id, event.target.value, 'retention')}
                        className="rounded-full border border-[#191919] bg-white px-3 py-1 text-xs font-semibold text-[#191919]"
                      >
                        <option value="Active">Active</option>
                        <option value="Paused">Paused</option>
                        <option value="Draft">Draft</option>
                      </select>
                    </div>
                    <p className="mt-2 text-xs text-[#6b5f55]">{flow.cadence}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Scheduled runs</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">Recurring automations and notifications.</p>
                <div className="mt-4 space-y-3 text-sm">
                  {scheduledRuns.map((run) => (
                    <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{run.name}</p>
                        <p className="text-xs text-[#6b5f55]">{run.audience}</p>
                        {run.lastRun ? <p className="text-[11px] text-[#6b5f55]">Last run {run.lastRun}</p> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                          {run.nextRun}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRun(run.id)}
                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] transition hover:bg-[#191919] hover:text-white"
                        >
                          Run now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Alerting rules</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">Signals that trigger human follow-up.</p>
                <div className="mt-4 space-y-3 text-sm">
                  {alertingRules.map((rule) => (
                    <div key={rule} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-sm text-[#191919]">{rule}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
