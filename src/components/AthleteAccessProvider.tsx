'use client'

import { createContext, useContext, useMemo, useState } from 'react'

type AthleteAccessState = {
  loading: boolean
  error?: string
  needsGuardianApproval: false
  canTransact: true
}

const defaultState: AthleteAccessState = {
  loading: false,
  needsGuardianApproval: false,
  canTransact: true,
}

const AthleteAccessContext = createContext<AthleteAccessState>(defaultState)

export function AthleteAccessProvider({ children }: { children: React.ReactNode }) {
  const [state] = useState<AthleteAccessState>(defaultState)
  const value = useMemo(() => state, [state])
  return <AthleteAccessContext.Provider value={value}>{children}</AthleteAccessContext.Provider>
}

export const useAthleteAccess = () => useContext(AthleteAccessContext)
