'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { getSessionRoleState } from '@/lib/sessionRoleState'

export default function AthletePortalGate() {
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    let active = true

    const checkSession = async () => {
      const { data } = await supabase.auth.getUser()
      if (!active || !data.user) return

      const roleState = getSessionRoleState(data.user.user_metadata)
      const canUseAthletePortal =
        roleState.currentRole === 'athlete' || roleState.availableRoles.includes('athlete')

      if (canUseAthletePortal) {
        router.replace('/athlete/profile')
      }
    }

    void checkSession()

    return () => {
      active = false
    }
  }, [router, supabase])

  return null
}
