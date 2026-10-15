'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import OrgSidebar from '@/components/OrgSidebar'
import LoadingState from '@/components/LoadingState'
import { createSafeClientComponentClient as createClient } from '@/lib/supabaseHelpers'
import { getActiveOrganizationId } from '@/lib/clientOrganization'

export default function LegacyTrainingSessionsPage() {
  const supabase = createClient()
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    const orgId = await getActiveOrganizationId(supabase)
    if (!orgId) return setLoading(false)
    const { data } = await supabase.from('org_training_sessions')
      .select('id,title,starts_at,ends_at,timezone,location,capacity,status,org_training_session_bookings(id,status)')
      .eq('org_id', orgId).order('starts_at', { ascending: false })
    setSessions(data || []); setLoading(false)
  }, [supabase])
  useEffect(() => { void load() }, [load])
  return <div className="min-h-screen bg-[#f7f7f5] text-[#191919]"><OrgSidebar/><main className="mx-auto max-w-6xl px-5 py-10 lg:pl-72"><Link href="/org/training-packages" className="font-semibold underline">← Legacy Training Archive</Link><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wider text-[#b80f0a]">Read-only archive</p><h1 className="text-3xl font-bold">Legacy Training Sessions</h1><p className="mt-2 text-sm text-gray-600">Historical sessions and rosters remain available. Create and schedule new training products through Offerings.</p></div><Link href="/org/offerings/new" className="rounded-full bg-[#b80f0a] px-5 py-3 font-semibold text-white">Create Offering</Link></div>{loading ? <LoadingState/> : <div className="mt-8 space-y-4">{sessions.map(session => <Link href={`/org/training-sessions/${session.id}`} key={session.id} className="block rounded-2xl bg-white p-5 shadow-sm"><div className="flex justify-between gap-4"><div><h2 className="text-xl font-semibold">{session.title || 'Training session'}</h2><p className="mt-1 text-sm text-gray-600">{new Date(session.starts_at).toLocaleString('en-US', { timeZone: session.timezone || 'America/New_York' })} · {session.location || 'Location TBD'}</p></div><span className="capitalize">{session.status}</span></div><p className="mt-2 text-sm">{(session.org_training_session_bookings || []).length}/{session.capacity} roster records</p></Link>)}{!sessions.length ? <p className="rounded-2xl bg-white p-8 text-center text-gray-500">No legacy training sessions.</p> : null}</div>}</main></div>
}
