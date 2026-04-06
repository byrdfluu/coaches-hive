'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { selectProfileCompat } from '@/lib/profileSchemaCompat'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type AthleteAccessState = {
  loading: boolean
  error?: string
  accountOwnerType: 'athlete_adult' | 'athlete_minor' | 'guardian'
  guardianApprovalRule: 'required' | 'notify' | 'none'
  needsGuardianApproval: boolean
  canTransact: boolean
  isGuardian: boolean
}

const defaultState: AthleteAccessState = {
  loading: true,
  accountOwnerType: 'athlete_adult',
  guardianApprovalRule: 'required',
  needsGuardianApproval: false,
  canTransact: true,
  isGuardian: false,
}

const AthleteAccessContext = createContext<AthleteAccessState>(defaultState)

const calculateAge = (birthdate?: string | null) => {
  if (!birthdate) return null
  const date = new Date(birthdate)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const hasHadBirthday =
    now.getMonth() > date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate())
  if (!hasHadBirthday) age -= 1
  return age
}

export function AthleteAccessProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient()
  const [state, setState] = useState<AthleteAccessState>(defaultState)

  useEffect(() => {
    let active = true
    const loadAccess = async () => {
      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (!active) return
      if (!userId) {
        setState((prev) => ({ ...prev, loading: false, error: 'Not signed in.' }))
        return
      }
      const { data: profile, error: profileError } = await selectProfileCompat({
        supabase,
        userId,
        columns: ['account_owner_type', 'guardian_approval_rule', 'athlete_birthdate'],
      })
      if (!active) return
      if (profileError) {
        setState({
          loading: false,
          accountOwnerType: 'athlete_adult',
          guardianApprovalRule: 'required',
          needsGuardianApproval: false,
          canTransact: true,
          isGuardian: false,
        })
        return
      }
      const profileRow = (profile || null) as {
        account_owner_type?: AthleteAccessState['accountOwnerType'] | null
        guardian_approval_rule?: AthleteAccessState['guardianApprovalRule'] | null
        athlete_birthdate?: string | null
      } | null
      const accountOwnerType =
        profileRow?.account_owner_type || 'athlete_adult'
      const guardianApprovalRule =
        profileRow?.guardian_approval_rule || 'required'
      const birthdateAge = calculateAge(profileRow?.athlete_birthdate || null)
      const isGuardian = accountOwnerType === 'guardian'
      const needsGuardianApproval =
        !isGuardian &&
        (accountOwnerType === 'athlete_minor' ||
          (birthdateAge !== null && birthdateAge < 18) ||
          guardianApprovalRule === 'required')
      setState({
        loading: false,
        accountOwnerType,
        guardianApprovalRule,
        needsGuardianApproval,
        // Transaction access is now evaluated per target via guardian approval requests.
        canTransact: true,
        isGuardian,
      })
    }
    loadAccess()
    return () => {
      active = false
    }
  }, [supabase])

  const value = useMemo(() => state, [state])

  return <AthleteAccessContext.Provider value={value}>{children}</AthleteAccessContext.Provider>
}

export const useAthleteAccess = () => useContext(AthleteAccessContext)
