'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'

export default function AdminPlaybookPage() {
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [sopLibrary, setSopLibrary] = useState<Array<{ id: string; title: string; owner: string; lastUpdated: string }>>([])
  const [weeklyCadence, setWeeklyCadence] = useState<Array<{ day: string; focus: string }>>([])
  const [incidentChecklist, setIncidentChecklist] = useState<string[]>([])

  useEffect(() => {
    let active = true
    const loadPlaybook = async () => {
      setLoading(true)
      const response = await fetch('/api/admin/playbook')
      if (!response.ok) {
        setToast('Unable to load playbook.')
        setLoading(false)
        return
      }
      const payload = await response.json()
      if (!active) return
      setSopLibrary(payload.config?.sopLibrary || [])
      setWeeklyCadence(payload.config?.weeklyCadence || [])
      setIncidentChecklist(payload.config?.incidentChecklist || [])
      setLoading(false)
    }
    loadPlaybook()
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
            <h1 className="display text-3xl font-semibold text-[#191919]">Ops playbook</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">SOPs and weekly cadence for running the platform.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            {loading ? <LoadingState label="Loading playbook..." /> : null}
            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">SOP library</h2>
              <p className="mt-1 text-sm text-[#6b5f55]">Repeatable playbooks for core workflows.</p>
              <div className="mt-4 space-y-3 text-sm">
                {sopLibrary.map((sop) => (
                  <div key={sop.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#191919]">{sop.title}</p>
                      <p className="text-xs text-[#6b5f55]">
                        Owner: {sop.owner} · Updated {sop.lastUpdated}
                      </p>
                    </div>
                    <Link
                      href={`/admin/playbook/${sop.id}`}
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                    >
                      View SOP
                    </Link>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Weekly cadence</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">Recurring operating rhythm.</p>
                <div className="mt-4 space-y-3 text-sm">
                  {weeklyCadence.map((item) => (
                    <div key={item.day} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.day}</p>
                      <p className="mt-2 font-semibold text-[#191919]">{item.focus}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Incident checklist</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">Use for outages or payment issues.</p>
                <div className="mt-4 space-y-3 text-sm">
                  {incidentChecklist.map((item) => (
                    <div key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-sm text-[#191919]">{item}</p>
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
