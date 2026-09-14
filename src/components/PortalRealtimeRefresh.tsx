'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const sharedTables = ['profiles', 'active_workspace_preferences', 'notifications']
const coachTables = [
  'independent_coach_profiles', 'coach_athlete_links', 'coach_notes',
  'sessions', 'session_attendance', 'messages', 'threads',
  'availability_blocks', 'coach_membership_plans', 'coach_membership_subscriptions',
  'coach_programs', 'coach_training_plans', 'coach_training_plan_progress',
  'products', 'orders', 'payment_transactions', 'organization_memberships',
  'org_team_coaches', 'org_team_members',
]
const organizationTables = [
  'organizations', 'org_settings', 'organization_memberships', 'org_teams',
  'org_team_coaches', 'org_team_athletes', 'sessions', 'session_attendance',
  'messages', 'message_threads', 'org_notes', 'org_contacts', 'org_seasons',
  'org_games', 'org_fee_assignments', 'org_dues_schedules', 'org_event_collections',
  'fundraising_campaigns', 'org_compliance_items', 'products', 'orders',
  'payment_transactions',
]

/**
 * Supabase RLS remains the filter of record: the browser only receives changes
 * the signed-in identity is authorized to read. A short debounced reload also
 * refreshes client-side API state, not just React Server Components.
 */
export default function PortalRealtimeRefresh({ portal }: { portal: 'coach' | 'organization' }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let active = true
    const refresh = () => {
      if (!active || document.visibilityState === 'hidden' || timer) return
      timer = setTimeout(() => window.location.reload(), 650)
    }
    const tables = Array.from(new Set([...sharedTables, ...(portal === 'coach' ? coachTables : organizationTables)]))
    const channel = supabase.channel(`portal-refresh:${portal}:${crypto.randomUUID()}`)
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
    }
    channel.subscribe()

    // A mobile update may occur while the browser is backgrounded. Refresh on
    // return because browsers can suspend websocket delivery in that state.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [portal])
  return null
}
