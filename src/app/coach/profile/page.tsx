'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import CoachPublicProfileView from '@/components/CoachPublicProfileView'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const dynamic = 'force-dynamic'

export default function CoachProfilePage() {
  const supabase = createClientComponentClient()
  const [slug, setSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadCoachSlug = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user

      if (!user) {
        if (mounted) {
          setSlug(null)
          setLoading(false)
        }
        return
      }

      const metadataName =
        typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : ''

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()

      const profileName =
        profileRow && typeof profileRow.full_name === 'string' ? profileRow.full_name.trim() : ''
      const resolvedName = profileName || metadataName

      if (mounted) {
        setSlug(resolvedName ? slugify(resolvedName) : null)
        setLoading(false)
      }
    }

    loadCoachSlug()
    return () => {
      mounted = false
    }
  }, [supabase])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="min-w-0">
            {loading ? (
              <LoadingState label="Loading your profile…" />
            ) : slug ? (
              <CoachPublicProfileView slug={slug} selfView />
            ) : (
              <EmptyState
                title="Finish your coach profile first"
                description="Add your coach name in settings before previewing the athlete-facing coach profile."
                action={
                  <Link
                    href="/coach/settings#profile"
                    className="inline-flex items-center rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Go to settings
                  </Link>
                }
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
