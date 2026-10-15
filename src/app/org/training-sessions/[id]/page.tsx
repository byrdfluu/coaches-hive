'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import OrgSidebar from '@/components/OrgSidebar'
import LoadingState from '@/components/LoadingState'
import { createSafeClientComponentClient as createClient } from '@/lib/supabaseHelpers'
import { getActiveOrganizationId } from '@/lib/clientOrganization'

export default function LegacyTrainingSessionDetail() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [session, setSession] = useState<any>(null)
  const [roster, setRoster] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    const orgId = await getActiveOrganizationId(supabase)
    if (!orgId) return setLoading(false)
    const [{ data: row }, { data: rosterRows }] = await Promise.all([
      supabase.from('org_training_sessions').select('*').eq('id', id).eq('org_id', orgId).maybeSingle(),
      supabase.rpc('my_org_training_session_roster', { p_session_id: id }),
    ])
    setSession(row || null); setRoster(rosterRows || []); setLoading(false)
  }, [id, supabase])
  useEffect(() => { void load() }, [load])
  return <div className="min-h-screen bg-[#f7f7f5] text-[#191919]"><OrgSidebar/><main className="mx-auto max-w-5xl px-5 py-10 lg:pl-72"><Link href="/org/training-sessions" className="font-semibold underline">← Legacy Training Sessions</Link>{loading ? <LoadingState/> : !session ? <p className="mt-8">Training session not found.</p> : <><p className="mt-6 text-sm font-semibold uppercase tracking-wider text-[#b80f0a]">Read-only legacy record</p><h1 className="text-3xl font-bold">{session.title || 'Training session'}</h1><section className="mt-8 rounded-2xl bg-white p-6 shadow-sm"><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="font-semibold">Date and time</dt><dd>{new Date(session.starts_at).toLocaleString('en-US', { timeZone: session.timezone || 'America/New_York' })} – {new Date(session.ends_at).toLocaleTimeString('en-US', { timeZone: session.timezone || 'America/New_York' })}</dd></div><div><dt className="font-semibold">Location</dt><dd>{session.location || 'Location TBD'}</dd></div><div><dt className="font-semibold">Capacity</dt><dd>{session.capacity}</dd></div><div><dt className="font-semibold">Status</dt><dd className="capitalize">{session.status}</dd></div></dl>{session.description ? <p className="mt-5">{session.description}</p> : null}</section><section className="mt-6 rounded-2xl bg-white p-6 shadow-sm"><div className="flex justify-between"><h2 className="text-xl font-semibold">Roster and booking history</h2><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => void load()}>Refresh</button></div><div className="mt-4 divide-y">{roster.map(row => <div key={row.booking_id} className="grid gap-1 py-3 text-sm sm:grid-cols-4"><strong>{row.athlete_name}</strong><span>{row.booking_type}</span><span>{row.booking_status}</span><span>{new Date(row.booked_at).toLocaleString()}</span></div>)}{!roster.length ? <p className="py-5 text-gray-500">No registrations.</p> : null}</div></section></>}</main></div>
}
