import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { data: organizations } = await supabaseAdmin.from('organizations').select('id,name,org_type')
  const org = (organizations || []).find((row) => isUuid(slug) ? row.id === slug : slugify(row.name || '') === slugify(slug))
  if (!org) return { title: 'Organization unavailable', robots: { index: false, follow: false } }
  const { data: settings } = await supabaseAdmin.from('org_settings').select('org_name,description,location,sports,profile_image_url,brand_logo_url,portal_preferences').eq('org_id', org.id).maybeSingle()
  const preferences = settings?.portal_preferences && typeof settings.portal_preferences === 'object' ? settings.portal_preferences as Record<string, unknown> : {}
  const publicProfile = preferences.public_profile && typeof preferences.public_profile === 'object' ? preferences.public_profile as Record<string, unknown> : {}
  if (publicProfile.enabled === false || publicProfile.visible === false) return { title: 'Organization unavailable', robots: { index: false, follow: false } }
  const name = settings?.org_name || org.name
  const sports = settings?.sports
  const sport = Array.isArray(sports) ? sports[0] : null
  const title = `${name}${sport ? ` · ${sport}` : ''}`
  const description = settings?.description || `${name}${settings?.location ? ` in ${settings?.location}` : ''} on Coaches Hive.`
  const image = settings?.profile_image_url || settings?.brand_logo_url || '/og-home.jpg'
  return { title, description, alternates: { canonical: `/organizations/${org.id}` }, openGraph: { type: 'website', title, description, url: `/organizations/${org.id}`, images: [image] }, twitter: { card: 'summary_large_image', title, description, images: [image] } }
}

export default function OrganizationProfileLayout({ children }: { children: React.ReactNode }) { return children }
