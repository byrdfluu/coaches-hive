'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import posthog from 'posthog-js'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type OrgPublic = {
  id: string
  name: string
  org_type?: string | null
  profile_image_url?: string | null
  brand_cover_url?: string | null
  brand_primary_color?: string | null
  brand_accent_color?: string | null
  description?: string | null
  director_display_name?: string | null
  location?: string | null
  website_url?: string | null
  social_links?: string[] | null
  service_area?: string | null
  sports?: string[] | null
  programs?: string[] | null
  age_groups?: string[] | null
  competition_levels?: string[] | null
  season_start?: string | null
  season_end?: string | null
  registration_status?: string | null
  registration_deadline?: string | null
  pricing_summary?: string | null
  active_athlete_count?: number
  practice_locations?: string[] | null
  teams?: Array<{ id: string; name: string; age_group?: string | null; competition_level?: string | null; registration_status?: string | null; roster_capacity?: number | null; coach_names?: string[] }>
  gallery?: Array<{ id: string; image_url: string; created_at?: string | null }> | null
  open_tryouts?: Array<{
    id: string
    name: string
    sport?: string | null
    age_group?: string | null
    event_date?: string | null
    event_time?: string | null
    registration_fee_cents?: number | null
  }> | null
  enrollment_forms?: Array<{
    id: string
    title: string
    description?: string | null
    slug: string
    sport?: string | null
    age_group?: string | null
    enrollment_fee_cents?: number | null
  }> | null
}

const formatSeasonDate = (value?: string | null) => {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

const formatEventDate = (value?: string | null) => {
  if (!value) return 'Date TBD'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatEventTime = (value?: string | null) => {
  if (!value) return 'Time TBD'
  const [hours, minutes] = String(value || '').split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value || 'Time TBD'
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatFee = (value?: number | null) => {
  const amount = (value ?? 0) / 100
  return amount > 0 ? `$${amount.toFixed(2).replace(/\.00$/, '')}` : 'Free'
}

export default function OrgPublicPage() {
  const supabase = createClientComponentClient()
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = String(params.slug || '')
  const refCode = searchParams.get('ref') || ''
  const [org, setOrg] = useState<OrgPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const publicProfilePath = `/organizations/${slug}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ''}`
  const signupHref = (role: 'athlete' | 'coach', intent = 'join') => {
    const intendedReturn = `${publicProfilePath}${publicProfilePath.includes('?') ? '&' : '?'}intent=${encodeURIComponent(intent)}`
    return `/signup?${new URLSearchParams({
      role,
      from_slug: slug,
      from_type: 'org',
      intent,
      return_to: intendedReturn,
      ...(refCode ? { ref: refCode } : {}),
    }).toString()}`
  }
  const signInHref = `/login?next=${encodeURIComponent(publicProfilePath)}`

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null)).catch(() => setCurrentUserId(null))
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadOrg = async () => {
      setLoading(true)
      const response = await fetch(`/api/org/public?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        if (active) setUnavailableReason(payload?.unavailable_reason || (response.status === 404 ? 'not_found' : 'unavailable'))
        setLoading(false)
        return
      }
      if (!active) return
      setOrg(payload.org || null)
      setUnavailableReason(payload.unavailable_reason || null)
      setLoading(false)
    }
    loadOrg()
    return () => {
      active = false
    }
  }, [slug])

  useEffect(() => {
    if (!refCode || !slug) return
    const orgDisplayName = org?.name || null
    if (orgDisplayName) {
      try {
        localStorage.setItem('ch_from_org', JSON.stringify({ slug, name: orgDisplayName }))
      } catch {
        // ignore storage errors
      }
    }
  }, [refCode, slug, org?.name])

  useEffect(() => {
    if (!org?.id) return
    posthog.capture('public_profile_opened', { profile_type: 'organization', profile_id: org.id, ref: refCode || null })
  }, [org?.id, refCode])

  const trackAction = (action: string) => {
    if (!org?.id) return
    posthog.capture('public_profile_action_clicked', { profile_type: 'organization', profile_id: org.id, action })
  }

  const logo = org?.profile_image_url || '/CHLogoTransparent.PNG'
  const accent = org?.brand_accent_color || '#b80f0a'
  const primary = org?.brand_primary_color || '#191919'
  const rawGallery = org?.gallery
  const publicGallery = Array.isArray(rawGallery)
    ? rawGallery.map(item => item.image_url).filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const openTryouts: NonNullable<OrgPublic['open_tryouts']> = Array.isArray(org?.open_tryouts) ? (org?.open_tryouts ?? []) : []
  const enrollmentForms: NonNullable<OrgPublic['enrollment_forms']> = Array.isArray(org?.enrollment_forms) ? (org?.enrollment_forms ?? []) : []
  const coverStyle = org?.brand_cover_url
    ? { backgroundImage: `url(${org.brand_cover_url})` }
    : { backgroundImage: `linear-gradient(120deg, ${primary}10 0%, ${accent}22 100%)` }

  if (!loading && !org) {
    const privateProfile = unavailableReason === 'private'
    return <main className="page-shell"><div className="relative z-10 mx-auto max-w-3xl px-6 py-16"><section className="glass-card border border-[#191919] bg-white p-8 text-center"><p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization profile</p><h1 className="mt-3 text-2xl font-semibold text-[#191919]">{privateProfile ? 'This profile is private' : 'Organization unavailable'}</h1><p className="mt-3 text-sm text-[#4a4a4a]">{privateProfile ? 'This organization is not currently sharing its profile publicly.' : 'The link may have changed or the organization may no longer be active.'}</p><div className="mt-5 flex flex-wrap justify-center gap-3"><Link href="/organizations" className="rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white">Browse organizations</Link><Link href="/coaches" className="rounded-full border border-[#191919] px-5 py-2.5 text-sm font-semibold text-[#191919]">Find a coach</Link></div></section></div></main>
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <section className="glass-card border border-[#191919] bg-white p-0 overflow-hidden">
          <div className="h-48 w-full bg-cover bg-center" style={coverStyle} />
          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className="h-16 w-16 rounded-2xl border border-[#191919] bg-white bg-cover bg-center"
                  style={{ backgroundImage: `url(${logo})` }}
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
                  <h1 className="text-3xl font-semibold text-[#191919]">{org?.name || 'Organization'}</h1>
                  <p className="text-sm text-[#4a4a4a]">
                    {org?.org_type ? `${org.org_type.replace(/_/g, ' ')} · ` : ''}
                    {org?.location || 'Location not listed'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`coacheshive://open?from=${encodeURIComponent(`/organizations/${org?.id || slug}`)}`} onClick={() => trackAction('open_app')} className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Open in app</a>
                <Link
                  href="/contact"
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Contact Coaches Hive
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="glass-card border border-[#191919] bg-white p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Overview</p>
            <p className="mt-3 text-sm text-[#4a4a4a]">
              {loading
                ? 'Loading org details...'
                : org?.description || 'Organization details coming soon.'}
            </p>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Programs</p>
            <div className="mt-3 space-y-2 text-sm text-[#4a4a4a]">
              <p><span className="font-semibold text-[#191919]">Sports:</span> {org?.sports?.join(', ') || 'Not listed'}</p>
              <p><span className="font-semibold text-[#191919]">Programs:</span> {org?.programs?.join(', ') || 'Not listed'}</p>
              <p><span className="font-semibold text-[#191919]">Ages served:</span> {org?.age_groups?.join(', ') || 'Not listed'}</p>
              <p><span className="font-semibold text-[#191919]">Service area:</span> {org?.service_area || 'Not listed'}</p>
            </div>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Operating details</p>
            <div className="mt-3 space-y-2 text-sm text-[#4a4a4a]">
              <p>
                <span className="font-semibold text-[#191919]">Season:</span>{' '}
                {`${formatSeasonDate(org?.season_start)} - ${formatSeasonDate(org?.season_end)}`}
              </p>
              <p><span className="font-semibold text-[#191919]">Registration:</span> {org?.registration_status || 'Not listed'}</p>
              <p><span className="font-semibold text-[#191919]">Active athletes:</span> {org?.active_athlete_count ?? 0}</p>
            </div>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Contact</p>
            <div className="mt-3">
              <Link
                href={currentUserId && org?.id ? `/athlete/messages?new=1&type=org&id=${org.id}` : signupHref('athlete', 'message')}
                onClick={() => trackAction('message')}
                className="inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                {`Message "${org?.name || 'Organization'}"`}
              </Link>
            </div>
          </div>
        </section>

        {org?.teams?.length ? <section className="mt-6 glass-card border border-[#191919] bg-white p-5"><p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Teams</p><div className="mt-3 grid gap-3 md:grid-cols-2">{org.teams.map(team => <div key={team.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4"><h3 className="font-semibold text-[#191919]">{team.name}</h3><p className="mt-1 text-sm text-[#4a4a4a]">{[team.age_group,team.competition_level].filter(Boolean).join(' · ') || 'Team details coming soon'}</p>{team.coach_names?.length ? <p className="mt-2 text-xs text-[#4a4a4a]">Coaches: {team.coach_names.join(', ')}</p> : null}</div>)}</div></section> : null}

        {publicGallery.length > 0 ? (
          <section className="mt-6 glass-card border border-[#191919] bg-white p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Gallery</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {publicGallery.map((imageUrl, index) => (
                <div
                  key={`${imageUrl}-${index}`}
                  className="h-28 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] bg-cover bg-center"
                  style={{ backgroundImage: `url(${imageUrl})` }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {(openTryouts.length > 0 || enrollmentForms.length > 0) ? (
          <section className="mt-6 glass-card border border-[#191919] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Open opportunities</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">Tryouts and enrollment</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {openTryouts.map((tryout) => (
                <div key={tryout.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Tryout</p>
                  <h3 className="mt-2 text-base font-semibold text-[#191919]">{tryout.name}</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">
                    {[tryout.sport, tryout.age_group].filter(Boolean).join(' · ') || 'Open athlete registration'}
                  </p>
                  <p className="mt-2 text-xs text-[#4a4a4a]">
                    {formatEventDate(tryout.event_date)} · {formatEventTime(tryout.event_time)} · {formatFee(tryout.registration_fee_cents)}
                  </p>
                  <Link
                    href={`/tryouts/${tryout.id}`}
                    className="mt-4 inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    Register for tryout
                  </Link>
                </div>
              ))}

              {enrollmentForms.map((form) => (
                <div key={form.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Enrollment</p>
                  <h3 className="mt-2 text-base font-semibold text-[#191919]">{form.title}</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">
                    {form.description || [form.sport, form.age_group].filter(Boolean).join(' · ') || 'Apply to join this program.'}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-[#191919]">
                    {formatFee(form.enrollment_fee_cents)}
                  </p>
                  <Link
                    href={`/enroll/${form.slug}`}
                    className="mt-4 inline-flex rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-white transition-colors"
                  >
                    Apply for enrollment
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {refCode ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#191919] bg-white px-4 py-3 shadow-xl">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#191919]">Join {org?.name || 'this organization'}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={signupHref('athlete')}
                onClick={() => trackAction('signup_athlete')}
                className="accent-button px-4 py-2 text-sm"
              >
                Join as athlete →
              </a>
              <a
                href={signupHref('coach')}
                onClick={() => trackAction('signup_coach')}
                className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-white transition-colors"
              >
                Join as coach →
              </a>
            </div>
          </div>
        </div>
      ) : null}
      {!refCode && org ? <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#191919] bg-white px-4 py-3 shadow-xl"><div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-[#191919]">Connect with {org.name}</p><div className="flex gap-2"><Link href={signInHref} onClick={() => trackAction('sign_in')} className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold">Sign in</Link><Link href={signupHref('athlete')} onClick={() => trackAction('signup_athlete')} className="accent-button px-4 py-2 text-sm">Sign up</Link></div></div></div> : null}
    </main>
  )
}
