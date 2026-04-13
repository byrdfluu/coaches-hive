'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

export type AthleteProfileSummary = {
  id: string
  name: string
  sport: string
  avatar_url?: string | null
  bio?: string | null
  birthdate?: string | null
  grade_level?: string | null
  season?: string | null
  location?: string | null
}

type AthleteProfileContextValue = {
  subProfiles: AthleteProfileSummary[]
  activeAthleteProfileId: string | null
  activeSubProfileId: string | null
  activeAthleteProfile: AthleteProfileSummary | null
  activeSubProfile: AthleteProfileSummary | null
  mainAthleteLabel: string
  activeAthleteLabel: string
  hasMultipleAthletes: boolean
  setActiveAthleteProfileId: (id: string | null) => void
  setActiveSubProfileId: (id: string | null) => void
  reloadProfiles: () => Promise<void>
}

const AthleteProfileContext = createContext<AthleteProfileContextValue>({
  subProfiles: [],
  activeAthleteProfileId: null,
  activeSubProfileId: null,
  activeAthleteProfile: null,
  activeSubProfile: null,
  mainAthleteLabel: 'Athlete',
  activeAthleteLabel: 'Athlete',
  hasMultipleAthletes: false,
  setActiveAthleteProfileId: () => {},
  setActiveSubProfileId: () => {},
  reloadProfiles: async () => {},
})

export function AthleteProfileProvider({ children }: { children: ReactNode }) {
  const supabase = createClientComponentClient()
  const [subProfiles, setSubProfiles] = useState<AthleteProfileSummary[]>([])
  const [mainAthleteLabel, setMainAthleteLabel] = useState(() => {
    return 'Athlete'
  })
  const [activeAthleteProfileId, setActiveAthleteProfileIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return (
      window.localStorage.getItem('ch_active_athlete_profile_id')
      || window.localStorage.getItem('ch_active_sub_profile_id')
      || null
    )
  })

  const reloadProfiles = useCallback(async () => {
    const [profilesResponse, userResult] = await Promise.all([
      fetch('/api/athlete/profiles').catch(() => null),
      supabase.auth.getUser().catch(() => null),
    ])

    if (profilesResponse?.ok) {
      const data = await profilesResponse.json().catch(() => [])
      const nextProfiles = Array.isArray(data) ? data : []
      setSubProfiles(nextProfiles)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ch:athlete-profiles-updated', { detail: { profiles: nextProfiles } }))
      }
    }

    const userId = userResult?.data?.user?.id || null
    if (!userId) return

    let profile: { full_name?: string | null } | null = null
    try {
      const response = await fetch('/api/athlete/profile', { cache: 'no-store' }).catch(() => null)
      const payload = response?.ok ? await response.json().catch(() => null) : null
      profile = payload?.profile || null
    } catch {
      profile = null
    }

    const resolvedName = String(profile?.full_name || '').trim()
    if (resolvedName) {
      setMainAthleteLabel(resolvedName)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ch_main_athlete_label', resolvedName)
      }
    }
  }, [supabase])

  useEffect(() => {
    reloadProfiles()
  }, [reloadProfiles])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleExternalSelection = (event: Event) => {
      const detail = (event as CustomEvent).detail as { id?: string | null } | undefined
      const nextId = typeof detail?.id === 'string' && detail.id.trim() ? detail.id.trim() : null
      setActiveAthleteProfileIdState(nextId)
      if (nextId) {
        window.localStorage.setItem('ch_active_athlete_profile_id', nextId)
        window.localStorage.setItem('ch_active_sub_profile_id', nextId)
      } else {
        window.localStorage.removeItem('ch_active_athlete_profile_id')
        window.localStorage.removeItem('ch_active_sub_profile_id')
      }
    }
    window.addEventListener('ch:set-active-sub-profile', handleExternalSelection)
    return () => {
      window.removeEventListener('ch:set-active-sub-profile', handleExternalSelection)
    }
  }, [])

  // Clear stale active profile if it no longer exists
  useEffect(() => {
    if (activeAthleteProfileId && subProfiles.length > 0) {
      const exists = subProfiles.some((p) => p.id === activeAthleteProfileId)
      if (!exists) setActiveAthleteProfileIdState(null)
    }
  }, [activeAthleteProfileId, subProfiles])

  const setActiveAthleteProfileId = useCallback((id: string | null) => {
    setActiveAthleteProfileIdState(id)
    if (typeof window !== 'undefined') {
      if (id) {
        window.localStorage.setItem('ch_active_athlete_profile_id', id)
        window.localStorage.setItem('ch_active_sub_profile_id', id)
      } else {
        window.localStorage.removeItem('ch_active_athlete_profile_id')
        window.localStorage.removeItem('ch_active_sub_profile_id')
      }
      window.dispatchEvent(new CustomEvent('ch:active-athlete-changed', { detail: { id } }))
    }
  }, [])

  const activeAthleteProfile = subProfiles.find((p) => p.id === activeAthleteProfileId) ?? null
  const activeSubProfile = activeAthleteProfile
  const activeAthleteLabel = activeAthleteProfile?.name || mainAthleteLabel
  const hasMultipleAthletes = subProfiles.length > 0

  return (
    <AthleteProfileContext.Provider
      value={{
        subProfiles,
        activeAthleteProfileId,
        activeSubProfileId: activeAthleteProfileId,
        activeAthleteProfile,
        activeSubProfile,
        mainAthleteLabel,
        activeAthleteLabel,
        hasMultipleAthletes,
        setActiveAthleteProfileId,
        setActiveSubProfileId: setActiveAthleteProfileId,
        reloadProfiles,
      }}
    >
      {children}
    </AthleteProfileContext.Provider>
  )
}

export const useAthleteProfile = () => useContext(AthleteProfileContext)
