import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { data } = await supabaseAdmin.from('profiles').select('id,full_name,bio,avatar_url,brand_logo_url,specialties,coach_privacy_settings').in('role', ['coach', 'assistant_coach'])
  const coach = (data || []).find((row) => isUuid(slug) ? row.id === slug : slugify(row.full_name || '') === slugify(slug))
  const privacy = coach?.coach_privacy_settings && typeof coach.coach_privacy_settings === 'object' ? coach.coach_privacy_settings as Record<string, unknown> : {}
  if (!coach || privacy.visibleToAthletes === false) return { title: 'Coach unavailable', robots: { index: false, follow: false } }
  const { data: independent } = await supabaseAdmin.from('independent_coach_profiles').select('training_locations,is_active').eq('coach_id', coach.id).maybeSingle()
  if (independent?.is_active === false) return { title: 'Coach unavailable', robots: { index: false, follow: false } }
  const sport = Array.isArray(coach.specialties) ? coach.specialties[0] : null
  const location = Array.isArray(independent?.training_locations) ? independent.training_locations[0] : null
  const title = `${coach.full_name || 'Coach'}${sport ? ` · ${sport}` : ''}`
  const description = coach.bio || `View ${coach.full_name || 'this coach'}${location ? ` in ${location}` : ''} on Coaches Hive.`
  const image = coach.brand_logo_url || coach.avatar_url || '/og-home.jpg'
  return { title, description, alternates: { canonical: `/coaches/${coach.id}` }, openGraph: { type: 'profile', title, description, url: `/coaches/${coach.id}`, images: [image] }, twitter: { card: 'summary_large_image', title, description, images: [image] } }
}

export default function CoachProfileLayout({ children }: { children: React.ReactNode }) { return children }
