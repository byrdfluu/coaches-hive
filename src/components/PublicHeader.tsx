'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useMemo, useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import LogoMark from '@/components/LogoMark'
import BrandWordmark from '@/components/BrandWordmark'
import { selectProfileCompat, updateProfileCompat, upsertProfileCompat } from '@/lib/profileSchemaCompat'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { launchSurface } from '@/lib/launchSurface'

const links = [
  { href: '/coach', label: 'Coaches' },
  { href: '/athlete', label: 'Athletes' },
  { href: '/organizations', label: 'Organizations' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
]

type MenuItem = {
  href: string
  label: string
}

type AthleteSwitcherProfile = {
  id: string
  name: string
  avatar_url?: string | null
}

const ORG_ROLE_KEYS = new Set([
  'org_admin',
  'school_admin',
  'club_admin',
  'travel_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

const roleToPortal = (role: string): 'coach' | 'athlete' | 'org' | 'guardian' | null => {
  if (role === 'coach') return 'coach'
  if (role === 'athlete') return 'athlete'
  if (role === 'guardian') return 'guardian'
  if (ORG_ROLE_KEYS.has(role)) return 'org'
  return null
}

const portalToDashboardHref: Record<'coach' | 'athlete' | 'org' | 'guardian', string> = {
  coach: '/coach/dashboard',
  athlete: '/athlete/dashboard',
  org: '/org',
  guardian: '/guardian/dashboard',
}

const resolveAudienceSignInHref = (pathname: string) => {
  if (pathname === '/coach' || pathname.startsWith('/coach/')) {
    return '/login?role=coach&next=/coach/dashboard'
  }
  if (pathname === '/athlete' || pathname.startsWith('/athlete/')) {
    return '/login?role=athlete&next=/athlete/dashboard'
  }
  if (
    pathname === '/organizations'
    || pathname.startsWith('/organizations/')
    || pathname === '/org'
    || pathname.startsWith('/org/')
  ) {
    return '/login?next=/org'
  }
  return '/login'
}

const resolveAudienceSignUpHref = (pathname: string) => {
  if (pathname === '/coach' || pathname.startsWith('/coach/')) {
    return '/signup?role=coach'
  }
  if (pathname === '/athlete' || pathname.startsWith('/athlete/')) {
    return '/signup?role=athlete'
  }
  if (
    pathname === '/organizations'
    || pathname.startsWith('/organizations/')
    || pathname === '/org'
    || pathname.startsWith('/org/')
  ) {
    return '/signup?role=org_admin'
  }
  return '/signup'
}

const SEEDED_PROFILE_NAMES = new Set(['Jordan Lee', 'Maya Lopez', 'Organization Admin'])

const getDefaultAvatar = (role: 'coach' | 'athlete' | 'org' | 'admin' | 'guardian' | null) => {
  if (role === 'coach') return '/avatar-coach-placeholder.png'
  return '/avatar-athlete-placeholder.png'
}

const isPlaceholderAvatar = (value?: string | null) => Boolean(value?.includes('placeholder'))

const toDisplayName = (value?: string | null) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.includes('@')) {
    return ''
  }
  return trimmed
}

export default function PublicHeader() {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const portalRole = useMemo<'coach' | 'athlete' | 'org' | 'admin' | 'guardian' | null>(() => {
    if (pathname !== '/coach' && pathname.startsWith('/coach/')) return 'coach'
    if (pathname !== '/athlete' && pathname.startsWith('/athlete/')) return 'athlete'
    if (pathname !== '/guardian/accept-invite' && pathname.startsWith('/guardian/')) return 'guardian'
    if (pathname === '/org' || pathname.startsWith('/org/')) return 'org'
    if (pathname.startsWith('/admin')) return 'admin'
    return null
  }, [pathname])
  const isPortal = portalRole !== null
  const isCoach = portalRole === 'coach'
  const isGuardian = portalRole === 'guardian'
  const isOrg = portalRole === 'org'
  const isAdmin = portalRole === 'admin'
  const defaultAvatar = getDefaultAvatar(portalRole)
  const signInHref = useMemo(() => resolveAudienceSignInHref(pathname), [pathname])
  const signUpHref = useMemo(() => resolveAudienceSignUpHref(pathname), [pathname])
  const visibleLinks = useMemo(
    () => launchSurface.publicOrgEntryPointsEnabled ? links : links.filter((link) => link.href !== '/organizations'),
    [],
  )
  const hideForCoachPortalPlanFlow =
    (pathname === '/select-plan' || pathname === '/checkout')
    && searchParams.get('portal') === 'coach'

  const [avatarUrl, setAvatarUrl] = useState(() => {
    if (typeof window === 'undefined') return '/avatar-athlete-placeholder.png'
    return window.localStorage.getItem('ch_avatar_url') || '/avatar-athlete-placeholder.png'
  })
  const [profileName, setProfileName] = useState(() => {
    if (typeof window === 'undefined') return 'Account'
    return toDisplayName(window.localStorage.getItem('ch_full_name')) || 'Account'
  })
  const [switchRoleTarget, setSwitchRoleTarget] = useState<('coach' | 'athlete' | 'org' | 'guardian') | null>(null)
  const [athleteProfiles, setAthleteProfiles] = useState<AthleteSwitcherProfile[]>([])
  const [athleteMainLabel, setAthleteMainLabel] = useState(() => {
    if (typeof window === 'undefined') return 'Athlete'
    return toDisplayName(window.localStorage.getItem('ch_main_athlete_label')) || 'Athlete'
  })
  const [athleteActiveSubProfileId, setAthleteActiveSubProfileId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem('ch_active_sub_profile_id') || null
  })

  useEffect(() => {
    if (!portalRole || typeof window === 'undefined') return
    const cachedAvatar = window.localStorage.getItem('ch_avatar_url')
    const cachedName = window.localStorage.getItem('ch_full_name')
    const cachedMainAthleteLabel = window.localStorage.getItem('ch_main_athlete_label')
    const cachedActiveSubProfileId = window.localStorage.getItem('ch_active_sub_profile_id')

    setAvatarUrl((prev) => {
      if (cachedAvatar) return cachedAvatar
      if (prev && !isPlaceholderAvatar(prev)) return prev
      return defaultAvatar
    })
    setProfileName((prev) => {
      if (cachedName) return toDisplayName(cachedName)
      if (portalRole === 'admin') return 'Admin'
      return prev || 'Account'
    })
    if (portalRole === 'athlete') {
      setAthleteMainLabel(toDisplayName(cachedMainAthleteLabel) || toDisplayName(cachedName) || 'Athlete')
      setAthleteActiveSubProfileId(cachedActiveSubProfileId || null)
    }
  }, [defaultAvatar, portalRole])

  useEffect(() => {
    let mounted = true
    const onAvatarUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as { url?: string } | undefined
      if (detail?.url) {
        window.localStorage.setItem('ch_avatar_url', detail.url)
        setAvatarUrl(detail.url)
      }
    }
    const onNameUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as { name?: string } | undefined
      const nextName = toDisplayName(detail?.name)
      if (nextName) {
        window.localStorage.setItem('ch_full_name', nextName)
        setProfileName(nextName)
        if (portalRole === 'athlete') {
          window.localStorage.setItem('ch_main_athlete_label', nextName)
          setAthleteMainLabel(nextName)
        }
      }
    }
    const onActiveAthleteChange = (event: Event) => {
      const detail = (event as CustomEvent).detail as { id?: string | null } | undefined
      const nextId = typeof detail?.id === 'string' && detail.id.trim() ? detail.id.trim() : null
      setAthleteActiveSubProfileId(nextId)
    }
    const onAthleteProfilesUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        profiles?: Array<{ id?: string; name?: string | null; avatar_url?: string | null }>
      } | undefined
      const detailProfiles = detail?.profiles ?? []
      const nextProfiles = Array.isArray(detailProfiles) ? detailProfiles : []
      setAthleteProfiles(
        nextProfiles
          .filter((row) => typeof row?.id === 'string' && row.id.trim())
          .map((row) => ({
            id: String(row.id),
            name: String(row.name || 'Athlete').trim() || 'Athlete',
            avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
          })),
      )
    }
    window.addEventListener('ch:avatar-updated', onAvatarUpdate)
    window.addEventListener('ch:name-updated', onNameUpdate)
    window.addEventListener('ch:active-athlete-changed', onActiveAthleteChange)
    window.addEventListener('ch:athlete-profiles-updated', onAthleteProfilesUpdated)
    const syncProfile = async (user: User | null) => {
      if (!isPortal || !mounted) return
      if (!user) {
        setAvatarUrl(defaultAvatar)
        setProfileName(portalRole === 'admin' ? 'Admin' : 'Account')
        return
      }
      const metadataName = toDisplayName(
        String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim(),
      )
      const emailLocalPart = String(user.email || '').split('@')[0]?.trim() || ''
      const metadataAvatar = (user.user_metadata?.avatar_url || user.user_metadata?.picture || '').trim()
      if (metadataName && mounted) setProfileName(metadataName)
      const cachedName = window.localStorage.getItem('ch_full_name')
      if (cachedName && mounted) setProfileName(toDisplayName(cachedName))
      const cachedAvatar = window.localStorage.getItem('ch_avatar_url')
      if (cachedAvatar && mounted) setAvatarUrl(cachedAvatar)
      const role = user.user_metadata?.role
      const { data: profileRow, error: profileError } = await selectProfileCompat({
        supabase,
        userId: user.id,
        columns: ['full_name', 'avatar_url'],
      })
      if (profileError) {
        if (!mounted) return
        const fallbackName = metadataName || cachedName || 'Account'
        const fallbackAvatar = metadataAvatar || cachedAvatar || defaultAvatar
        setProfileName(fallbackName)
        setAvatarUrl(fallbackAvatar)
        return
      }
      const profile = (profileRow || null) as { full_name?: string | null; avatar_url?: string | null } | null
      if (!profile) {
        await upsertProfileCompat({
          supabase,
          payload: {
            id: user.id,
            full_name: metadataName || null,
            role: role || null,
            avatar_url: metadataAvatar || null,
          },
        })
      } else if (profile.full_name && metadataName && SEEDED_PROFILE_NAMES.has(profile.full_name.trim())) {
        await updateProfileCompat({
          supabase,
          userId: user.id,
          payload: { full_name: metadataName },
        })
      } else if (
        profile.full_name
        && metadataName
        && emailLocalPart
        && profile.full_name.trim().toLowerCase() === emailLocalPart.toLowerCase()
      ) {
        await updateProfileCompat({
          supabase,
          userId: user.id,
          payload: { full_name: metadataName },
        })
      } else if (!profile.full_name && metadataName) {
        await updateProfileCompat({
          supabase,
          userId: user.id,
          payload: { full_name: metadataName },
        })
      } else if (!profile.avatar_url && metadataAvatar) {
        await updateProfileCompat({
          supabase,
          userId: user.id,
          payload: { avatar_url: metadataAvatar },
        })
      }
      if (!mounted) return
      const normalizedProfileName = toDisplayName(profile?.full_name?.trim())
      const profileNameMatchesEmailLocalPart = Boolean(
        normalizedProfileName
        && emailLocalPart
        && normalizedProfileName.toLowerCase() === emailLocalPart.toLowerCase(),
      )
      const shouldUseMetadata = Boolean(
        normalizedProfileName
        && metadataName
        && (SEEDED_PROFILE_NAMES.has(normalizedProfileName) || profileNameMatchesEmailLocalPart),
      )
      const nextName = (shouldUseMetadata ? metadataName : normalizedProfileName) || metadataName || 'Account'
      const nextAvatar = profile?.avatar_url || metadataAvatar || cachedAvatar || defaultAvatar
      setProfileName(nextName)
      setAvatarUrl(nextAvatar)
      if (nextName) window.localStorage.setItem('ch_full_name', nextName)
      if (nextAvatar && !isPlaceholderAvatar(nextAvatar)) {
        window.localStorage.setItem('ch_avatar_url', nextAvatar)
      }
    }
    const loadProfile = async () => {
      if (!isPortal) return
      const { data } = await supabase.auth.getUser()
      await syncProfile(data.user ?? null)
    }
    loadProfile()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncProfile(session?.user ?? null)
    })
    return () => {
      mounted = false
      window.removeEventListener('ch:avatar-updated', onAvatarUpdate)
      window.removeEventListener('ch:name-updated', onNameUpdate)
      window.removeEventListener('ch:active-athlete-changed', onActiveAthleteChange)
      window.removeEventListener('ch:athlete-profiles-updated', onAthleteProfilesUpdated)
      subscription.unsubscribe()
    }
  }, [defaultAvatar, isPortal, portalRole, supabase])

  useEffect(() => {
    let active = true
    const loadAvailableRoles = async () => {
      if (!isPortal || !portalRole) {
        if (active) setSwitchRoleTarget(null)
        return
      }
      const response = await fetch('/api/roles/available').catch(() => null)
      if (!response?.ok || !active) {
        setSwitchRoleTarget(null)
        return
      }
      const payload = await response.json().catch(() => null) as { roles?: string[] } | null
      const distinctPortals = new Set<'coach' | 'athlete' | 'org' | 'guardian'>()
      for (const role of payload?.roles || []) {
        const mapped = roleToPortal(String(role || ''))
        if (mapped) distinctPortals.add(mapped)
      }
      if (!distinctPortals.size || distinctPortals.size === 1) {
        setSwitchRoleTarget(null)
        return
      }

      if (portalRole !== 'admin') {
        distinctPortals.delete(portalRole)
      }
      if (portalRole === 'coach') {
        distinctPortals.delete('org')
      }
      const preferredOrder: Array<'coach' | 'athlete' | 'org' | 'guardian'> = ['coach', 'athlete', 'guardian', 'org']
      const firstAlt = preferredOrder.find((candidate) => distinctPortals.has(candidate)) || null
      setSwitchRoleTarget(firstAlt)
    }
    loadAvailableRoles()
    return () => {
      active = false
    }
  }, [isPortal, portalRole])

  useEffect(() => {
    if (portalRole !== 'athlete') return
    let active = true
    const loadAthleteProfiles = async () => {
      const response = await fetch('/api/athlete/profiles', { cache: 'no-store' }).catch(() => null)
      if (!active || !response?.ok) return
      const payload = (await response.json().catch(() => [])) as Array<{ id?: string; name?: string | null; avatar_url?: string | null }>
      if (!active) return
      setAthleteProfiles(
        payload
          .filter((row) => typeof row?.id === 'string' && row.id.trim())
          .map((row) => ({
            id: String(row.id),
            name: String(row.name || 'Athlete').trim() || 'Athlete',
            avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
          })),
      )
    }
    void loadAthleteProfiles()
    return () => {
      active = false
    }
  }, [portalRole])

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const athleteChipLabel = useMemo(() => {
    if (portalRole !== 'athlete') return profileName
    const activeSubProfile = athleteProfiles.find((profile) => profile.id === athleteActiveSubProfileId)
    return activeSubProfile?.name || athleteMainLabel || profileName
  }, [athleteActiveSubProfileId, athleteMainLabel, athleteProfiles, portalRole, profileName])

  const athleteChipAvatar = useMemo(() => {
    if (portalRole !== 'athlete') return avatarUrl
    const activeSubProfile = athleteProfiles.find((profile) => profile.id === athleteActiveSubProfileId)
    return activeSubProfile?.avatar_url || avatarUrl
  }, [athleteActiveSubProfileId, athleteProfiles, avatarUrl, portalRole])

  const selectAthleteContext = (subProfileId: string | null) => {
    if (typeof window !== 'undefined') {
      if (subProfileId) {
        window.localStorage.setItem('ch_active_sub_profile_id', subProfileId)
      } else {
        window.localStorage.removeItem('ch_active_sub_profile_id')
      }
      window.dispatchEvent(new CustomEvent('ch:set-active-sub-profile', { detail: { id: subProfileId } }))
      window.dispatchEvent(new CustomEvent('ch:active-athlete-changed', { detail: { id: subProfileId } }))
    }
    setAthleteActiveSubProfileId(subProfileId)
    setMenuOpen(false)
    setMobileOpen(false)
  }

  const profile = {
    name: portalRole === 'athlete' ? athleteChipLabel : profileName,
    avatar: portalRole === 'athlete' ? athleteChipAvatar : avatarUrl,
    dashboard: isAdmin ? '/admin' : isCoach ? '/coach/dashboard' : isGuardian ? '/guardian/dashboard' : isOrg ? '/org' : '/athlete/dashboard',
    settings: isAdmin ? '/admin/settings' : isCoach ? '/coach/settings' : isGuardian ? '/guardian/settings' : isOrg ? '/org/settings' : '/athlete/settings',
    profile: isAdmin ? '/admin' : isCoach ? '/coach/profile' : isGuardian ? '/guardian/dashboard' : isOrg ? '/org/settings#profile' : '/athlete/profile',
    notifications: isAdmin ? '/admin/support' : isCoach ? '/coach/notifications' : isGuardian ? '/guardian/approvals' : isOrg ? '/org/notifications' : '/athlete/notifications',
    billing: isAdmin ? '/admin/revenue' : isCoach ? '/coach/revenue' : isGuardian ? '/guardian/settings' : isOrg ? '/org/payments' : '/athlete/payments',
    support: isAdmin ? '/admin/support' : isCoach ? '/coach/support' : isGuardian ? '/guardian/settings' : isOrg ? '/org/support' : '/athlete/support',
  }
  const switchRoleItem = useMemo<MenuItem | null>(() => {
    if (!switchRoleTarget) return null
    return {
      href: portalToDashboardHref[switchRoleTarget],
      label:
        switchRoleTarget === 'coach'
          ? 'Switch to Coach'
          : switchRoleTarget === 'athlete'
            ? 'Switch to Athlete'
            : switchRoleTarget === 'guardian'
              ? 'Switch to Guardian'
            : 'Switch to Org',
    }
  }, [switchRoleTarget])

  const menuItems = useMemo<MenuItem[]>(() => {
    if (portalRole === 'admin') {
      return [
        { href: '/admin', label: 'Dashboard' },
        { href: '/admin/settings', label: 'Settings' },
        { href: '/admin/support', label: 'Support' },
        { href: '/logout', label: 'Sign out' },
      ]
    }
    if (portalRole === 'guardian') {
      return [
        { href: '/guardian/dashboard', label: 'Dashboard' },
        { href: '/guardian/approvals', label: 'Approvals' },
        { href: '/guardian/settings', label: 'Settings' },
        ...(switchRoleItem ? [switchRoleItem] : []),
        { href: '/logout', label: 'Sign out' },
      ]
    }
    return [
      { href: profile.dashboard, label: 'Dashboard' },
      { href: profile.profile, label: 'View profile' },
      { href: profile.settings, label: 'Settings' },
      { href: profile.support, label: 'Support' },
      ...(switchRoleItem ? [switchRoleItem] : []),
      { href: '/logout', label: 'Sign out' },
    ]
  }, [portalRole, profile.dashboard, profile.profile, profile.settings, profile.support, switchRoleItem])

  const closeMobileMenu = () => setMobileOpen(false)
  const mobileMenuLabel = mobileOpen ? 'Close' : 'Menu'

  if (hideForCoachPortalPlanFlow) {
    return null
  }

  return (
    <header className="relative z-40 bg-[var(--bg-alt)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
        <Link href={isPortal ? profile.dashboard : '/'} className="flex items-center gap-3">
          <div className="flex h-[50px] w-[50px] items-center justify-center overflow-hidden">
            <LogoMark className="h-[50px] w-[50px]" size={50} />
          </div>
          <BrandWordmark sport />
        </Link>
        <div className="hidden items-center gap-4 md:flex">
          {!isPortal && (
            <nav className="flex items-center gap-6 text-base font-medium text-[#4a4a4a]">
              {visibleLinks.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-[#191919]">
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
          {isPortal ? (
            <div className="relative z-[500]" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f7f6f4]"
              >
                {!isGuardian && (
                  <span
                    className="h-8 w-8 rounded-full border border-[#191919] bg-[#f7f6f4] bg-cover bg-center"
                    style={{ backgroundImage: `url(${profile.avatar})` }}
                  />
                )}
                <span>{profile.name}</span>
                <span className="text-xs">▾</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-[#191919] bg-white p-2 text-sm shadow-2xl z-[999]">
                  {!isAdmin && !isGuardian && (
                    <>
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <span
                          className="h-8 w-8 flex-shrink-0 rounded-full border border-[#dcdcdc] bg-[#f7f6f4] bg-cover bg-center"
                          style={{ backgroundImage: `url(${profile.avatar})` }}
                        />
                        <span className="truncate font-semibold text-[#191919]">{profile.name}</span>
                      </div>
                      {portalRole === 'athlete' && athleteProfiles.length > 0 ? (
                        <div className="px-3 pb-2 pt-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6b5f55]">Switch athlete</p>
                          <div className="mt-2 space-y-1">
                            <button
                              type="button"
                              onClick={() => selectAthleteContext(null)}
                              className={`block w-full rounded-xl px-3 py-2 text-left font-semibold ${
                                !athleteActiveSubProfileId ? 'bg-[#191919] text-white' : 'text-[#191919] hover:bg-[#f5f5f5]'
                              }`}
                            >
                              {athleteMainLabel}
                            </button>
                            {athleteProfiles.map((athleteProfile) => (
                              <button
                                type="button"
                                key={athleteProfile.id}
                                onClick={() => selectAthleteContext(athleteProfile.id)}
                                className={`block w-full rounded-xl px-3 py-2 text-left font-semibold ${
                                  athleteActiveSubProfileId === athleteProfile.id ? 'bg-[#191919] text-white' : 'text-[#191919] hover:bg-[#f5f5f5]'
                                }`}
                              >
                                {athleteProfile.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="my-1 border-t border-[#f0f0f0]" />
                    </>
                  )}
                  {menuItems.map((item) => (
                    <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2 font-semibold text-[#191919] hover:bg-[#f5f5f5]">
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href={signInHref}
                className="rounded-full border border-[#191919] px-4 py-2 text-base font-semibold text-[#191919] hover:bg-[#f7f6f4]"
              >
                Sign in
              </Link>
              <Link
                href={signUpHref}
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-base font-semibold text-white hover:bg-[#b80f0a]"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          {isPortal ? (
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className={`flex items-center gap-2 rounded-full border border-[#dcdcdc] bg-white py-1 text-sm font-semibold text-[#191919] shadow-[0_6px_16px_rgba(0,0,0,0.08)] ${isGuardian ? 'px-3' : 'pl-1 pr-3'}`}
              aria-expanded={mobileOpen}
              aria-label="Toggle account menu"
            >
              {!isGuardian && (
                <span
                  className="h-7 w-7 rounded-full border border-[#dcdcdc] bg-[#f7f6f4] bg-cover bg-center"
                  style={{ backgroundImage: `url(${profile.avatar})` }}
                />
              )}
              <span className="max-w-[80px] truncate">{profile.name.split(' ')[0]}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="flex items-center justify-center whitespace-nowrap rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm font-semibold text-black shadow-[0_6px_16px_rgba(0,0,0,0.08)]"
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation"
            >
              {mobileMenuLabel}
            </button>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-[450] border-t border-[#dcdcdc] bg-[var(--bg-alt)] shadow-lg md:hidden">
          <div className="mx-auto flex max-h-[calc(100dvh-88px)] max-w-6xl flex-col gap-4 overflow-y-auto px-4 py-4 text-sm text-[#191919] sm:px-6">
            {isPortal ? (
              <div className="flex flex-col gap-2">
                {!isAdmin && !isGuardian && (
                  <div className="flex items-center gap-3 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                    <span
                      className="h-9 w-9 flex-shrink-0 rounded-full border border-[#dcdcdc] bg-[#f7f6f4] bg-cover bg-center"
                      style={{ backgroundImage: `url(${profile.avatar})` }}
                    />
                    <span className="truncate text-sm font-semibold text-[#191919]">{profile.name}</span>
                  </div>
                )}
                {portalRole === 'athlete' && athleteProfiles.length > 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-white p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6b5f55]">Switch athlete</p>
                    <div className="mt-2 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => selectAthleteContext(null)}
                        className={`rounded-full border px-4 py-2 text-left font-semibold ${
                          !athleteActiveSubProfileId ? 'border-[#191919] bg-[#191919] text-white' : 'border-[#dcdcdc] text-[#191919]'
                        }`}
                      >
                        {athleteMainLabel}
                      </button>
                      {athleteProfiles.map((athleteProfile) => (
                        <button
                          type="button"
                          key={athleteProfile.id}
                          onClick={() => selectAthleteContext(athleteProfile.id)}
                          className={`rounded-full border px-4 py-2 text-left font-semibold ${
                            athleteActiveSubProfileId === athleteProfile.id ? 'border-[#191919] bg-[#191919] text-white' : 'border-[#dcdcdc] text-[#191919]'
                          }`}
                        >
                          {athleteProfile.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {menuItems.map((item) => (
                  <Link key={item.label} href={item.href} className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-center font-semibold text-[#191919]" onClick={closeMobileMenu}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : (
              <>
                <nav className="flex flex-col gap-3">
                  {visibleLinks.map((link) => (
                    <Link key={link.href} href={link.href} className="font-semibold" onClick={closeMobileMenu}>
                      {link.label}
                    </Link>
                  ))}
                </nav>
                <div className="flex flex-col gap-2">
                  <Link href={signInHref} className="rounded-full border border-[#191919] px-4 py-2 text-center font-semibold text-[#191919]" onClick={closeMobileMenu}>
                    Sign in
                  </Link>
                  <Link href={signUpHref} className="rounded-full bg-[#b80f0a] px-4 py-2 text-center font-semibold text-white" onClick={closeMobileMenu}>
                    Sign up
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
