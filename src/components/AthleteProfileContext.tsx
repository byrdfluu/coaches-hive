'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

export type SubProfile = {
  id: string
  name: string
  sport: string
  avatar_url?: string | null
  bio?: string | null
  birthdate?: string | null
  grade_level?: string | null
  season?: string | null
}

type AthleteProfileContextValue = {
  subProfiles: SubProfile[]
  activeSubProfileId: string | null
  activeSubProfile: SubProfile | null
  mainAthleteLabel: string
  activeAthleteLabel: string
  hasMultipleAthletes: boolean
  setActiveSubProfileId: (id: string | null) => void
  reloadProfiles: () => Promise<void>
}

const AthleteProfileContext = createContext<AthleteProfileContextValue>({
  subProfiles: [],
  activeSubProfileId: null,
  activeSubProfile: null,
  mainAthleteLabel: 'Athlete',
  activeAthleteLabel: 'Athlete',
  hasMultipleAthletes: false,
  setActiveSubProfileId: () => {},
  reloadProfiles: async () => {},
})

export function AthleteProfileProvider({ children }: { children: ReactNode }) {
  const supabase = createClientComponentClient()
  const [subProfiles, setSubProfiles] = useState<SubProfile[]>([])
  const [mainAthleteLabel, setMainAthleteLabel] = useState(() => {
    if (typeof window === 'undefined') return 'Athlete'
    return window.localStorage.getItem('ch_main_athlete_label') || 'Athlete'
  })
  const [activeSubProfileId, setActiveSubProfileIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem('ch_active_sub_profile_id') || null
  })

  const reloadProfiles = useCallback(async () => {
    const [profilesResponse, userResult] = await Promise.all([
      fetch('/api/athlete/profiles').catch(() => null),
      supabase.auth.getUser().catch(() => null),
    ])

    if (profilesResponse?.ok) {
      const data = await profilesResponse.json().catch(() => [])
      setSubProfiles(Array.isArray(data) ? data : [])
    }

    const userId = userResult?.data?.user?.id || null
    if (!userId) return

    let profile: { full_name?: string | null } | null = null
    try {
      const result = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle()
      profile = result.data || null
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
      setActiveSubProfileIdState(nextId)
      if (nextId) {
        window.localStorage.setItem('ch_active_sub_profile_id', nextId)
      } else {
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
    if (activeSubProfileId && subProfiles.length > 0) {
      const exists = subProfiles.some((p) => p.id === activeSubProfileId)
      if (!exists) setActiveSubProfileIdState(null)
    }
  }, [activeSubProfileId, subProfiles])

  const setActiveSubProfileId = useCallback((id: string | null) => {
    setActiveSubProfileIdState(id)
    if (typeof window !== 'undefined') {
      if (id) {
        window.localStorage.setItem('ch_active_sub_profile_id', id)
      } else {
        window.localStorage.removeItem('ch_active_sub_profile_id')
      }
      window.dispatchEvent(new CustomEvent('ch:active-athlete-changed', { detail: { id } }))
    }
  }, [])

  const activeSubProfile = subProfiles.find((p) => p.id === activeSubProfileId) ?? null
  const activeAthleteLabel = activeSubProfile?.name || mainAthleteLabel
  const hasMultipleAthletes = subProfiles.length > 0

  return (
    <AthleteProfileContext.Provider
      value={{
        subProfiles,
        activeSubProfileId,
        activeSubProfile,
        mainAthleteLabel,
        activeAthleteLabel,
        hasMultipleAthletes,
        setActiveSubProfileId,
        reloadProfiles,
      }}
    >
      {children}
    </AthleteProfileContext.Provider>
  )
}

export const useAthleteProfile = () => useContext(AthleteProfileContext)
