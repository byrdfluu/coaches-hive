'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Organization = { id: string; name?: string | null; org_type?: string | null; sport_primary?: string | null; sports_additional?: string[] | null; city?: string | null; state?: string | null }
type OrganizationSettings = { org_id: string; location?: string | null }
type Team = { org_id?: string | null; sport?: string | null }

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [settings, setSettings] = useState<OrganizationSettings[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const loadOrganizations = async () => {
      try {
        const response = await fetch('/api/public/orgs', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || 'Unable to load organizations.')
        if (!active) return
        setOrganizations(payload?.organizations || [])
        setSettings(payload?.settings || [])
        setTeams(payload?.teams || [])
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load organizations.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadOrganizations()
    return () => { active = false }
  }, [])

  const cards = useMemo(() => {
    const locationByOrg = new Map(settings.map((row) => [row.org_id, row.location || '']))
    const sportsByOrg = new Map<string, string[]>()
    teams.forEach((team) => {
      if (!team.org_id || !team.sport?.trim()) return
      sportsByOrg.set(team.org_id, Array.from(new Set([...(sportsByOrg.get(team.org_id) || []), team.sport.trim()])))
    })
    const normalizedQuery = query.trim().toLowerCase()
    return organizations.map((org) => {
      const name = org.name?.trim() || 'Organization'
      const canonicalSports = [org.sport_primary || '', ...(org.sports_additional || [])].filter(Boolean)
      const sports = canonicalSports.length ? canonicalSports : (sportsByOrg.get(org.id) || [])
      const location = [org.city, org.state].filter(Boolean).join(', ') || locationByOrg.get(org.id) || 'Location not listed'
      return { ...org, name, sports, location, slug: slugify(name) || org.id }
    }).filter((org) => !normalizedQuery || [org.name, org.location, org.org_type, ...org.sports].join(' ').toLowerCase().includes(normalizedQuery)).sort((a, b) => a.name.localeCompare(b.name))
  }, [organizations, query, settings, teams])

  return (
    <main className="min-h-[75vh] bg-[#f9f9f9] px-5 py-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#b80f0a]">Public directory</p>
        <h1 className="mt-3 text-4xl font-semibold text-[#191919]">Browse organizations</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[#4a4a4a]">Find an organization, review its programs and schedule, and begin registration from any browser.</p>
        <label className="mt-7 block max-w-xl">
          <span className="sr-only">Search organizations</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, sport, or location" className="w-full rounded-full border border-[#cfcfcf] bg-white px-5 py-3 text-[#191919] outline-none focus:border-[#b80f0a] focus:ring-2 focus:ring-[#b80f0a]/20" />
        </label>
        {loading ? <p className="mt-10 text-[#4a4a4a]">Loading organizations…</p> : null}
        {error ? <p className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p> : null}
        {!loading && !error && cards.length === 0 ? <p className="mt-10 rounded-2xl border border-[#dcdcdc] bg-white p-6 text-[#4a4a4a]">{query ? 'No organizations match your search.' : 'No public organizations are available yet.'}</p> : null}
        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Organizations">
          {cards.map((org) => (
            <article key={org.id} className="flex flex-col rounded-3xl border border-[#dcdcdc] bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b80f0a]">{org.org_type?.replace(/_/g, ' ') || 'Organization'}</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{org.name}</h2>
              <p className="mt-2 text-sm text-[#4a4a4a]">{org.location}</p>
              <p className="mt-4 flex-1 text-sm leading-6 text-[#4a4a4a]">{org.sports.length ? org.sports.join(' · ') : 'Programs and registration details available on the organization profile.'}</p>
              <Link href={`/organizations/${org.slug}`} className="mt-6 inline-flex w-fit rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#b80f0a]">View organization</Link>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
