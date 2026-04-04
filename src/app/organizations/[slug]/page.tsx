'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { launchSurface } from '@/lib/launchSurface'

type OrgPublic = {
  id: string
  name: string
  org_type?: string | null
  brand_logo_url?: string | null
  brand_cover_url?: string | null
  brand_primary_color?: string | null
  brand_accent_color?: string | null
  mission?: string | null
  policy_notes?: string | null
  location?: string | null
  website_url?: string | null
  instagram_url?: string | null
  facebook_url?: string | null
  x_url?: string | null
  service_area?: string | null
  program_categories?: string | null
  ages_served?: string | null
  season_start?: string | null
  season_end?: string | null
  business_hours?: string | null
  registration_status?: string | null
  public_gallery?: string[] | null
}

const formatSeasonDate = (value?: string | null) => {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

export default function OrgPublicPage() {
  const params = useParams()
  const router = useRouter()
  const slug = String(params.slug || '')
  const [org, setOrg] = useState<OrgPublic | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!launchSurface.publicOrgEntryPointsEnabled) {
      router.replace('/')
      return
    }

    let active = true
    const loadOrg = async () => {
      setLoading(true)
      const response = await fetch(`/api/org/public?slug=${slug}`, { cache: 'no-store' })
      if (!response.ok) {
        setLoading(false)
        return
      }
      const payload = await response.json()
      if (!active) return
      setOrg(payload.org || null)
      setLoading(false)
    }
    loadOrg()
    return () => {
      active = false
    }
  }, [router, slug])

  if (!launchSurface.publicOrgEntryPointsEnabled) {
    return null
  }

  const logo = org?.brand_logo_url || '/CHLogoTransparent.PNG'
  const accent = org?.brand_accent_color || '#b80f0a'
  const primary = org?.brand_primary_color || '#191919'
  const rawGallery = org?.public_gallery
  const publicGallery = Array.isArray(rawGallery)
    ? rawGallery.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const coverStyle = org?.brand_cover_url
    ? { backgroundImage: `url(${org.brand_cover_url})` }
    : { backgroundImage: `linear-gradient(120deg, ${primary}10 0%, ${accent}22 100%)` }

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
                : org?.mission || 'Organization details coming soon.'}
            </p>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Programs</p>
            <div className="mt-3 space-y-2 text-sm text-[#4a4a4a]">
              <p><span className="font-semibold text-[#191919]">Categories:</span> {org?.program_categories || 'Not listed'}</p>
              <p><span className="font-semibold text-[#191919]">Ages served:</span> {org?.ages_served || 'Not listed'}</p>
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
              <p><span className="font-semibold text-[#191919]">Business hours:</span> {org?.business_hours || 'Not listed'}</p>
              <p><span className="font-semibold text-[#191919]">Registration:</span> {org?.registration_status || 'Not listed'}</p>
            </div>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Contact</p>
            <div className="mt-3">
              <Link
                href={org?.id ? `/athlete/messages?new=1&type=org&id=${org.id}` : '/athlete/messages?new=1&type=org'}
                className="inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                {`Message "${org?.name || 'Organization'}"`}
              </Link>
            </div>
          </div>
        </section>

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
      </div>
    </main>
  )
}
