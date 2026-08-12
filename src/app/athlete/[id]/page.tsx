import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type PublicAthleteProfile = {
  id: string
  owner_user_id: string
  full_name: string
  avatar_url?: string | null
  bio?: string | null
  sport?: string | null
}

export default async function PublicAthleteProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) notFound()

  const { data } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id, owner_user_id, full_name, avatar_url, bio, sport')
    .eq('id', id)
    .eq('status', 'active')
    .eq('is_test', false)
    .maybeSingle()

  const athlete = data as PublicAthleteProfile | null
  if (!athlete) notFound()

  const { data: visibility } = await supabaseAdmin
    .from('profile_visibility')
    .select('visibility')
    .eq('athlete_id', athlete.owner_user_id)
    .eq('athlete_profile_id', athlete.id)
    .eq('section', 'profile')
    .maybeSingle()

  if (visibility && visibility.visibility !== 'public') notFound()

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-5 py-12 text-[#191919]">
      <section className="mx-auto max-w-3xl rounded-[2rem] border border-[#dcdcdc] bg-white p-6 shadow-sm sm:p-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div
            className="h-24 w-24 shrink-0 rounded-full border border-[#dcdcdc] bg-[#f5f5f5] bg-cover bg-center"
            style={athlete.avatar_url ? { backgroundImage: `url(${athlete.avatar_url})` } : undefined}
            aria-label={`${athlete.full_name} profile photo`}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#b80f0a]">Athlete profile</p>
            <h1 className="mt-2 text-4xl font-semibold">{athlete.full_name}</h1>
            {athlete.sport ? <p className="mt-2 text-lg text-[#4a4a4a]">{athlete.sport}</p> : null}
          </div>
        </div>

        {athlete.bio ? <p className="mt-8 border-t border-[#ececec] pt-6 text-base leading-7 text-[#4a4a4a]">{athlete.bio}</p> : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="rounded-full border border-[#191919] px-5 py-2.5 text-sm font-semibold">Coaches Hive</Link>
          <Link href="/open-app" className="rounded-full bg-[#b80f0a] px-5 py-2.5 text-sm font-semibold text-white">Open in the app</Link>
        </div>
      </section>
    </main>
  )
}
