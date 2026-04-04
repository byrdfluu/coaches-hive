'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

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
  setActiveSubProfileId: (id: string | null) => void
  reloadProfiles: () => Promise<void>
}

const AthleteProfileContext = createContext<AthleteProfileContextValue>({
  subProfiles: [],
  activeSubProfileId: null,
  activeSubProfile: null,
  setActiveSubProfileId: () => {},
  reloadProfiles: async () => {},
})

export function AthleteProfileProvider({ children }: { children: ReactNode }) {
  const [subProfiles, setSubProfiles] = useState<SubProfile[]>([])
  const [activeSubProfileId, setActiveSubProfileIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem('ch_active_sub_profile_id') || null
  })

  const reloadProfiles = useCallback(async () => {
    const res = await fetch('/api/athlete/profiles').catch(() => null)
    if (!res?.ok) return
    const data = await res.json().catch(() => [])
    setSubProfiles(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    reloadProfiles()
  }, [reloadProfiles])

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
    }
  }, [])

  const activeSubProfile = subProfiles.find((p) => p.id === activeSubProfileId) ?? null

  return (
    <AthleteProfileContext.Provider
      value={{ subProfiles, activeSubProfileId, activeSubProfile, setActiveSubProfileId, reloadProfiles }}
    >
      {children}
    </AthleteProfileContext.Provider>
  )
}

export const useAthleteProfile = () => useContext(AthleteProfileContext)