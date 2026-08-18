'use client'

import { useCallback, useEffect, useState } from 'react'
import CoachSidebar from '@/components/CoachSidebar'

type RecordRow = { athlete_id: string; athlete_name: string; status: 'pending' | 'present' | 'absent' }
type SessionRow = { id: string; title?: string | null; start_time?: string | null; attendance: RecordRow[] }

export default function CoachAttendancePage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/coach/attendance', { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setNotice(data.error || 'Unable to load attendance.')
    else {
      setSessions(data.sessions || [])
      setSelectedId((current) => current || data.sessions?.[0]?.id || '')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])
  const selected = sessions.find((item) => item.id === selectedId)

  const mark = async (athleteId: string, status: RecordRow['status']) => {
    setSessions((current) => current.map((session) => session.id === selectedId ? {
      ...session,
      attendance: session.attendance.map((record) => record.athlete_id === athleteId ? { ...record, status } : record),
    } : session))
    const response = await fetch('/api/coach/attendance', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: selectedId, athlete_id: athleteId, status }),
    })
    if (!response.ok) { setNotice('Attendance was not saved.'); await load() }
  }

  return <main className="page-shell"><div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><CoachSidebar /><section>
      <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Coach portal</p>
      <h1 className="display text-3xl font-semibold text-[#191919]">Attendance</h1>
      <p className="mt-2 text-sm text-[#4a4a4a]">The same per-athlete attendance records shown in the mobile app.</p>
      {notice && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{notice}</p>}
      {loading ? <p className="mt-8 text-sm text-[#4a4a4a]">Loading attendance…</p> : sessions.length === 0 ?
        <div className="glass-card mt-6 p-6"><h2 className="font-semibold">No sessions yet</h2><p className="mt-2 text-sm text-[#4a4a4a]">Create a calendar session to begin taking attendance.</p></div> : <>
        <label className="mt-6 block text-sm font-semibold">Session
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 block w-full rounded-xl border border-[#cfcfcf] bg-white px-3 py-3">
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.title || 'Coaching session'} · {session.start_time ? new Date(session.start_time).toLocaleString() : 'Date not set'}</option>)}
          </select>
        </label>
        <div className="mt-5 space-y-3">{selected?.attendance.length ? selected.attendance.map((record) => <div key={record.athlete_id} className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="font-semibold">{record.athlete_name}</span><div className="flex gap-2">
            {(['present','absent','pending'] as const).map((status) => <button key={status} onClick={() => void mark(record.athlete_id, status)} className={`rounded-full border px-3 py-2 text-xs font-semibold capitalize ${record.status === status ? 'border-[#191919] bg-[#191919] text-white' : 'border-[#bdbdbd] bg-white'}`}>{status}</button>)}
          </div></div>) : <div className="glass-card p-6 text-sm text-[#4a4a4a]">No linked athletes are available for this session.</div>}</div>
      </>}
    </section></div>
  </div></main>
}
