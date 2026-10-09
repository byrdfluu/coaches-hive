'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import BrandWordmark from '@/components/BrandWordmark'
import LogoMark from '@/components/LogoMark'
import { createSafeClientComponentClient } from '@/lib/supabaseHelpers'
import { buildPortalChoices, type PortalChoice, type PortalContextPayload } from '@/lib/portalChoices'
import PortalHomeActionStrip from '@/components/PortalHomeActionStrip'

type IconProps = { size?: number }
const makeIcon = (path: ReactNode) => function PortalIcon({ size = 20 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
}
const Home = makeIcon(<><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>)
const Users = makeIcon(<><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M16 5a4 4 0 0 1 0 7M17 14c3 0 5 3 5 7"/></>)
const CalendarDays = makeIcon(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"/></>)
const PackageOpen = makeIcon(<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 8 9 5 9-5M3 8v8l9 5 9-5V8"/></>)
const MessageSquare = makeIcon(<><path d="M4 4h16v13H8l-4 4V4Z"/></>)
const BadgeDollarSign = makeIcon(<><circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9M12 6v12"/></>)
const BarChart3 = makeIcon(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>)
const ClipboardCheck = makeIcon(<><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 13l2 2 4-5"/></>)
const ShieldCheck = makeIcon(<><path d="M12 3 4 6v6c0 5 3 8 8 9 5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-5"/></>)
const Settings = makeIcon(<><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></>)
const CircleHelp = makeIcon(<><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2M12 18h.01"/></>)
const LogOut = makeIcon(<><path d="M10 17l5-5-5-5M15 12H3M15 3h6v18h-6"/></>)
const Bell = makeIcon(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>)
const Search = makeIcon(<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>)
const Menu = makeIcon(<><path d="M4 7h16M4 12h16M4 17h16"/></>)
const X = makeIcon(<><path d="m5 5 14 14M19 5 5 19"/></>)
const LayoutGrid = makeIcon(<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>)
const ChevronDown = makeIcon(<path d="m7 10 5 5 5-5"/>)

export type PortalKind = 'organization' | 'coach' | 'family' | 'league' | 'admin'

type NavItem = { href: string; label: string }
type NavGroup = { label: string; href: string; icon: typeof Home; items: NavItem[] }

const portalConfig: Record<PortalKind, { eyebrow: string; home: string; groups: NavGroup[] }> = {
  organization: {
    eyebrow: 'Organization portal',
    home: '/org',
    groups: [
      { label: 'Home', href: '/org', icon: Home, items: [{ href: '/org', label: 'Overview' }, { href: '/org/notifications', label: 'Notifications' }] },
      { label: 'People', href: '/org/teams', icon: Users, items: [{ href: '/org/teams', label: 'Teams' }, { href: '/org/roster-status', label: 'Roster status' }, { href: '/org/coaches', label: 'Coaches and staff' }, { href: '/org/offering-coaches', label: 'Offering coach assignments' }, { href: '/org/contacts', label: 'Contacts' }, { href: '/org/permissions', label: 'Permissions' }, { href: '/org/enrollment', label: 'Enrollment' }] },
      { label: 'Schedule', href: '/org/calendar', icon: CalendarDays, items: [{ href: '/org/calendar', label: 'Calendar' }, { href: '/org/games', label: 'Games' }, { href: '/org/seasons', label: 'Seasons' }] },
      { label: 'Messages', href: '/org/messages', icon: MessageSquare, items: [{ href: '/org/messages', label: 'Messages and announcements' }, { href: '/org/notes', label: 'Notes' }, { href: '/org/notifications', label: 'Notifications' }] },
      { label: 'Offerings', href: '/org/tryouts', icon: PackageOpen, items: [{ href: '/org/tryouts', label: 'Tryouts' }, { href: '/org/marketplace', label: 'Marketplace' }, { href: '/org/waivers', label: 'Waivers' }] },
      { label: 'Payments', href: '/org/payments', icon: BadgeDollarSign, items: [{ href: '/org/payments', label: 'Payments' }, { href: '/org/collections', label: 'Collections' }, { href: '/org/billing', label: 'Plans and billing' }, { href: '/org/stripe-setup', label: 'Stripe setup' }] },
      { label: 'Reports', href: '/org/reports', icon: BarChart3, items: [{ href: '/org/reports', label: 'Reports' }, { href: '/org/tasks', label: 'Tasks' }, { href: '/org/audit', label: 'Audit history' }, { href: '/org/compliance', label: 'Compliance' }, { href: '/org/coach-documents', label: 'Coach documents' }] },
    ],
  },
  coach: {
    eyebrow: 'Coach portal',
    home: '/coach/dashboard',
    groups: [
      { label: 'Home', href: '/coach/dashboard', icon: Home, items: [{ href: '/coach/dashboard', label: 'Dashboard' }, { href: '/coach/notifications', label: 'Notifications' }] },
      { label: 'People', href: '/coach/athletes', icon: Users, items: [{ href: '/coach/athletes', label: 'Athletes' }, { href: '/coach/orgs-teams', label: 'Organizations and teams' }, { href: '/coach/organization-assignments', label: 'Organization assignments' }, { href: '/coach/retention', label: 'Retention' }] },
      { label: 'Schedule', href: '/coach/calendar', icon: CalendarDays, items: [{ href: '/coach/calendar', label: 'Calendar' }, { href: '/coach/bookings', label: 'Bookings' }, { href: '/coach/availability', label: 'Availability' }, { href: '/coach/attendance', label: 'Attendance' }] },
      { label: 'Messages', href: '/coach/messages', icon: MessageSquare, items: [{ href: '/coach/messages', label: 'Messages' }, { href: '/coach/notes', label: 'Notes' }, { href: '/coach/notifications', label: 'Notifications' }] },
      { label: 'Offerings', href: '/coach/programs', icon: PackageOpen, items: [{ href: '/coach/programs', label: 'Programs' }, { href: '/coach/plans', label: 'Training plans' }, { href: '/coach/memberships', label: 'Memberships' }, { href: '/coach/marketplace', label: 'Marketplace' }] },
      { label: 'Payments', href: '/coach/payments', icon: BadgeDollarSign, items: [{ href: '/coach/payments', label: 'Payments' }, { href: '/coach/revenue', label: 'Revenue' }, { href: '/coach/stripe-setup', label: 'Stripe setup' }] },
      { label: 'Reports', href: '/coach/reports', icon: BarChart3, items: [{ href: '/coach/reports', label: 'Reports' }, { href: '/coach/reviews', label: 'Reviews' }, { href: '/coach/waivers', label: 'Waivers' }, { href: '/coach/documents', label: 'Documents' }] },
    ],
  },
  family: {
    eyebrow: 'Parent & athlete portal',
    home: '/athlete/dashboard',
    groups: [
      { label: 'Home', href: '/athlete/dashboard', icon: Home, items: [{ href: '/athlete/dashboard', label: 'Dashboard' }, { href: '/athlete/workspace', label: 'My workspace' }, { href: '/athlete/notifications', label: 'Notifications' }] },
      { label: 'Connections', href: '/athlete/orgs-teams', icon: Users, items: [{ href: '/athlete/orgs-teams', label: 'Organizations and teams' }, { href: '/athlete/discover', label: 'Discover coaches' }, { href: '/athlete/profile', label: 'Athlete profile' }] },
      { label: 'Schedule', href: '/athlete/calendar', icon: CalendarDays, items: [{ href: '/athlete/calendar', label: 'Calendar' }, { href: '/athlete/programs', label: 'Programs' }, { href: '/athlete/plans', label: 'Training plans' }] },
      { label: 'Messages', href: '/athlete/messages', icon: MessageSquare, items: [{ href: '/athlete/messages', label: 'Messages' }, { href: '/athlete/notes', label: 'Notes' }, { href: '/athlete/notifications', label: 'Notifications' }] },
      { label: 'Payments', href: '/athlete/payments', icon: BadgeDollarSign, items: [{ href: '/athlete/payments', label: 'Payments and receipts' }, { href: '/athlete/memberships', label: 'Memberships' }, { href: '/athlete/marketplace', label: 'Marketplace' }, { href: '/athlete/waivers', label: 'Waivers' }] },
    ],
  },
  league: {
    eyebrow: 'League director portal',
    home: '/league',
    groups: [
      { label: 'Home', href: '/league', icon: Home, items: [{ href: '/league', label: 'Overview' }, { href: '/league/announcements', label: 'Announcements' }] },
      { label: 'Organizations', href: '/league/clubs', icon: Users, items: [{ href: '/league/clubs', label: 'Clubs' }, { href: '/league/divisions', label: 'Divisions' }, { href: '/league/teams', label: 'Teams' }, { href: '/league/staff', label: 'Staff and permissions' }] },
      { label: 'Schedule', href: '/league/schedule', icon: CalendarDays, items: [{ href: '/league/schedule', label: 'Schedule and results' }, { href: '/league/seasons', label: 'Seasons' }] },
      { label: 'Registrations', href: '/league/registrations', icon: ClipboardCheck, items: [{ href: '/league/registrations', label: 'Registrations' }, { href: '/league/documents', label: 'Documents' }, { href: '/league/submissions', label: 'Compliance' }] },
      { label: 'Payments', href: '/league/payments', icon: BadgeDollarSign, items: [{ href: '/league/payments', label: 'Payments and balances' }] },
      { label: 'Reports', href: '/league/audit', icon: BarChart3, items: [{ href: '/league/audit', label: 'Audit history' }] },
    ],
  },
  admin: {
    eyebrow: 'Superadmin',
    home: '/admin',
    groups: [
      { label: 'Home', href: '/admin', icon: Home, items: [{ href: '/admin', label: 'Overview' }, { href: '/admin/control-center', label: 'Control center' }] },
      { label: 'People', href: '/admin/users', icon: Users, items: [{ href: '/admin/users', label: 'Users' }, { href: '/admin/athletes', label: 'Athletes' }, { href: '/admin/coaches', label: 'Coaches' }, { href: '/admin/orgs', label: 'Organizations' }, { href: '/admin/workspaces', label: 'Workspaces' }] },
      { label: 'Payments', href: '/admin/revenue', icon: BadgeDollarSign, items: [{ href: '/admin/revenue', label: 'Revenue' }, { href: '/admin/payment-accounting', label: 'Payment accounting' }, { href: '/admin/refunds', label: 'Refunds' }, { href: '/admin/payouts', label: 'Payouts' }, { href: '/admin/disputes', label: 'Disputes' }, { href: '/admin/stripe-reconciliation', label: 'Stripe reconciliation' }] },
      { label: 'Operations', href: '/admin/operations', icon: ClipboardCheck, items: [{ href: '/admin/operations', label: 'Operations' }, { href: '/admin/system-health', label: 'System health' }, { href: '/admin/webhooks', label: 'Webhooks' }, { href: '/admin/push-health', label: 'Push health' }, { href: '/admin/audit', label: 'Audit' }] },
      { label: 'Insights', href: '/admin/insights', icon: BarChart3, items: [{ href: '/admin/insights', label: 'Insights' }, { href: '/admin/programs', label: 'Programs' }, { href: '/admin/tryouts', label: 'Tryouts' }, { href: '/admin/orders', label: 'Orders' }, { href: '/admin/exports', label: 'Exports' }] },
      { label: 'Governance', href: '/admin/governance', icon: ShieldCheck, items: [{ href: '/admin/governance', label: 'Governance' }, { href: '/admin/moderation', label: 'Content moderation' }, { href: '/admin/verifications', label: 'Verifications' }, { href: '/admin/support', label: 'Support' }, { href: '/admin/settings', label: 'Settings' }] },
    ],
  },
}

const isCurrent = (pathname: string, href: string) => pathname === href || (href !== '/org' && href !== '/admin' && pathname.startsWith(`${href}/`))

export default function PortalAppShell({ portal, children }: { portal: PortalKind; children: ReactNode }) {
  const pathname = usePathname()
  const config = portalConfig[portal]
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [workspaceName, setWorkspaceName] = useState(portal === 'admin' ? 'Coaches Hive' : config.eyebrow)
  const [personName, setPersonName] = useState('Account')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [portalContext, setPortalContext] = useState<PortalContextPayload | null>(null)
  const [switchingChoice, setSwitchingChoice] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [attentionCount, setAttentionCount] = useState(0)

  useEffect(() => {
    let active = true
    const loadIdentity = async () => {
      const [roleResponse, auth] = await Promise.all([
        fetch('/api/roles/available', { cache: 'no-store' }).catch(() => null),
        createSafeClientComponentClient().auth.getUser(),
      ])
      const rolePayload = await roleResponse?.json().catch(() => null)
      if (!active) return
      const user = auth.data.user
      const fullName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim()
      if (fullName) setPersonName(fullName)
      const avatar = String(user?.user_metadata?.avatar_url || '').trim()
      if (avatar) setAvatarUrl(avatar)
      const workspaces = Array.isArray(rolePayload?.workspaces) ? rolePayload.workspaces : []
      if (rolePayload && !rolePayload.error) setPortalContext(rolePayload)
      const activeWorkspace = workspaces.find((workspace: { workspace_id?: string }) => workspace.workspace_id === rolePayload?.active_workspace_id)
        || workspaces.find((workspace: { is_last_used?: boolean }) => workspace.is_last_used)
      if (activeWorkspace?.display_name) setWorkspaceName(activeWorkspace.display_name)
    }
    void loadIdentity()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const loadAttention = async () => {
      const response = await fetch('/api/notifications', { cache: 'no-store' }).catch(() => null)
      const payload = await response?.json().catch(() => null)
      if (!active || !response?.ok) return
      const rows = Array.isArray(payload?.notifications) ? payload.notifications : []
      setAttentionCount(rows.filter((row: { read_at?: string | null }) => !row.read_at).length)
    }
    void loadAttention()
    return () => { active = false }
  }, [pathname])

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [])

  const activeGroup = config.groups.find((group) => group.items.some((item) => isCurrent(pathname, item.href))) || config.groups[0]
  const activeItem = activeGroup.items.find((item) => isCurrent(pathname, item.href)) || activeGroup.items[0]
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (normalized.length < 2) return []
    return config.groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))
      .filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(normalized))
      .slice(0, 8)
  }, [config.groups, query])
  const initials = personName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CH'
  const portalChoices = useMemo(() => buildPortalChoices(portalContext || {}), [portalContext])
  const mobilePrimaryGroups = config.groups.slice(0, 4)
  const mobileSecondaryGroups = config.groups.slice(4)
  const activeIsMobileSecondary = mobileSecondaryGroups.some((group) => group.label === activeGroup.label)
  const isPortalHome = pathname === config.home
  const switchChoice = async (choice: PortalChoice) => {
    if (switchingChoice) return
    setSwitchingChoice(choice.id)
    setSwitchError(null)
    const response = await fetch('/api/workspaces/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: choice.workspaceId,
        acting_role: choice.actingRole,
        athlete_profile_id: choice.athleteProfileId,
        coach_team_id: choice.coachTeamId,
      }),
    }).catch(() => null)
    const payload = await response?.json().catch(() => null)
    if (!response?.ok) {
      setSwitchError(payload?.error || 'Unable to switch workspace. Please retry.')
      setSwitchingChoice(null)
      return
    }
    const requestedDestination = String(payload?.next_path || choice.href || '').trim()
    const destination = requestedDestination.startsWith('/') ? requestedDestination : choice.href
    setWorkspaceOpen(false)
    // Workspace selection changes the authoritative session cookie. A full
    // navigation ensures the destination renders with that new server state
    // instead of racing the App Router cache.
    window.location.assign(destination)
  }

  const settingsItems = portal === 'organization' && pathname === '/org/settings'
    ? [
        { href: '#profile', label: 'Profile' },
        { href: '#locations', label: 'Locations' },
        { href: '#age-groups', label: 'Age groups' },
        { href: '#branding', label: 'Branding' },
        { href: '#policies', label: 'Policies' },
        { href: '#requirements', label: 'Requirements' },
        { href: '#compliance', label: 'Compliance' },
        { href: '#modules', label: 'Modules' },
        { href: '#billing', label: 'Billing' },
        { href: '#seasons', label: 'Seasons' },
        { href: '#payments', label: 'Payments' },
        { href: '#export-center', label: 'Export center' },
        { href: '#account', label: 'Account controls' },
      ]
    : portal === 'coach' && pathname === '/coach/settings'
      ? [
          { href: '#profile', label: 'Profile' },
          { href: '#verification', label: 'Verification' },
          { href: '#security', label: 'Security' },
          { href: '#branding', label: 'Branding' },
          { href: '#policies', label: 'Policies' },
          { href: '#communication', label: 'Communication' },
          { href: '#notifications', label: 'Notifications' },
          { href: '#payouts', label: 'Payouts' },
          { href: '#plans', label: 'Plans' },
          { href: '#integrations', label: 'Integrations' },
          { href: '#privacy', label: 'Privacy' },
          { href: '#export-center', label: 'Export center' },
          { href: '#account', label: 'Account controls' },
        ]
    : activeGroup.items

  const navigation = (
    <>
      <div className="ch-portal-brand">
        <LogoMark size={38} className="h-9 w-9" />
        <div className="min-w-0">
          <BrandWordmark className="text-white" />
          <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[.18em] text-white/55">{config.eyebrow}</p>
        </div>
      </div>
      <button type="button" onClick={() => setWorkspaceOpen((value) => !value)} className="ch-workspace-switcher" aria-expanded={workspaceOpen}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#c91512] text-xs font-black text-white">{workspaceName.slice(0, 2).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{workspaceName}</strong><span className="block truncate text-xs text-white/55">Switch workspace or role</span></span>
        <ChevronDown size={16} />
      </button>
      {workspaceOpen ? <div className="ch-workspace-menu">
        <p>Switch profile or workspace</p>
        {portalChoices.map((choice) => <button key={choice.id} type="button" disabled={Boolean(switchingChoice)} onClick={() => void switchChoice(choice)} className={choice.active ? 'is-active' : ''}>
          <span>{choice.label}</span><small>{switchingChoice === choice.id ? 'Opening…' : choice.detail}</small>
        </button>)}
        {switchError ? <div role="alert">{switchError}</div> : null}
      </div> : null}
      <nav className="ch-primary-nav" aria-label={`${config.eyebrow} navigation`}>
        {config.groups.map((group) => {
          const Icon = group.icon
          const active = group.label === activeGroup.label
          const badge = group.label === 'Messages' ? attentionCount : 0
          return <Link key={group.label} href={group.href} className={active ? 'is-active' : ''}><Icon size={19} /><span>{group.label}</span>{badge > 0 ? <span className="ch-nav-badge">{badge > 99 ? '99+' : badge}</span> : null}</Link>
        })}
      </nav>
      <div className="ch-sidebar-footer">
        <Link href={portal === 'organization' ? '/org/settings' : portal === 'coach' ? '/coach/settings' : portal === 'family' ? '/athlete/settings' : '/admin/settings'}><Settings size={19} />Settings</Link>
        <Link href={portal === 'organization' ? '/org/support' : portal === 'coach' ? '/coach/support' : portal === 'family' ? '/athlete/support' : '/admin/support'}><CircleHelp size={19} />Support</Link>
        <Link href="/logout" className="text-white/65"><LogOut size={19} />Sign out</Link>
      </div>
    </>
  )

  return (
    <div className={`ch-portal-shell ch-portal-${portal}`}>
      <aside className="ch-desktop-sidebar">{navigation}</aside>
      <header className="ch-portal-topbar">
        <button type="button" className="ch-mobile-menu" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"><Menu size={22} /></button>
        <div className="min-w-0"><p>{activeGroup.label}</p><h1>{activeItem.label}</h1></div>
        <button type="button" className="ch-topbar-search" onClick={() => setSearchOpen(true)}><Search size={18} /><span>Search this portal</span><kbd>⌘K</kbd></button>
        <Link className="ch-topbar-icon" href={portal === 'organization' ? '/org/notifications' : portal === 'coach' ? '/coach/notifications' : portal === 'family' ? '/athlete/notifications' : '/admin/operations'} aria-label={attentionCount ? `${attentionCount} unread notifications` : 'Notifications'}><Bell size={19} />{attentionCount > 0 ? <span className="ch-attention-dot">{attentionCount > 9 ? '9+' : attentionCount}</span> : null}</Link>
        <div className="ch-user-chip">
          {avatarUrl ? <span style={{ backgroundImage: `url(${avatarUrl})` }} /> : <span>{initials}</span>}
          <strong>{personName}</strong>
        </div>
      </header>
      <aside className="ch-context-nav" aria-label={`${activeGroup.label} pages`}>
        <p>{settingsItems === activeGroup.items ? activeGroup.label : 'Settings'}</p>
        {settingsItems.map((item) => <Link key={item.href} href={item.href} className={item.href.startsWith('#') ? '' : isCurrent(pathname, item.href) ? 'is-active' : ''}>{item.label}</Link>)}
      </aside>
      <main className="ch-portal-content">{isPortalHome ? <PortalHomeActionStrip portal={portal} attentionCount={attentionCount}/> : null}{children}</main>

      <nav className="ch-mobile-bottom-nav" aria-label="Mobile portal navigation">
        {mobilePrimaryGroups.map((group) => { const Icon = group.icon; const badge = group.label === 'Messages' ? attentionCount : 0; return <Link key={group.label} href={group.href} className={group.label === activeGroup.label ? 'is-active' : ''}><span className="relative"><Icon size={20}/>{badge > 0 ? <span className="ch-bottom-badge"/> : null}</span><span>{group.label}</span></Link> })}
        <button type="button" onClick={() => setDrawerOpen(true)} className={activeIsMobileSecondary ? 'is-active' : ''}><LayoutGrid size={20}/><span>More</span></button>
      </nav>

      {drawerOpen ? <div className="ch-mobile-drawer" role="dialog" aria-modal="true"><button className="ch-mobile-scrim" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"/><div className="ch-mobile-drawer-panel"><div className="flex items-center justify-between border-b p-4"><BrandWordmark sport/><button onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><X/></button></div><div className="p-4"><button type="button" onClick={() => setWorkspaceOpen((value) => !value)} className="flex w-full items-center justify-between rounded-2xl border bg-[#f7f6f4] p-4 text-left font-bold"><span>{workspaceName}</span><ChevronDown size={17}/></button>{workspaceOpen ? <div className="mt-2 rounded-2xl border bg-white p-2">{portalChoices.map((choice)=><button key={choice.id} type="button" onClick={() => void switchChoice(choice)} className="block w-full rounded-xl px-3 py-2 text-left"><strong className="block text-sm">{choice.label}</strong><span className="text-xs text-[#666]">{choice.detail}</span></button>)}</div>:null}<nav className="mt-4 space-y-1">{config.groups.map((group) => {const Icon=group.icon; return <div key={group.label}><Link onClick={() => setDrawerOpen(false)} href={group.href} className="flex items-center gap-3 rounded-xl px-3 py-3 font-bold"><Icon size={19}/>{group.label}</Link>{(group.label === activeGroup.label || mobileSecondaryGroups.some((secondary) => secondary.label === group.label)) ? <div className="ml-8 border-l pl-3">{group.items.map((item)=><Link onClick={() => setDrawerOpen(false)} key={item.href} href={item.href} className="block py-2 text-sm text-[#555]">{item.label}</Link>)}</div>:null}</div>})}</nav></div></div></div> : null}

      {searchOpen ? <div className="ch-search-dialog" role="dialog" aria-modal="true"><button className="ch-mobile-scrim" onClick={() => setSearchOpen(false)} aria-label="Close search"/><section><div className="flex items-center gap-3 border-b px-4"><Search size={20}/><input autoFocus value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search portal pages"/><button onClick={()=>setSearchOpen(false)}><X size={20}/></button></div><div className="p-2">{query.trim().length < 2 ? <p className="p-4 text-sm text-[#666]">Type at least two characters.</p> : searchResults.length ? searchResults.map((item)=><Link onClick={()=>setSearchOpen(false)} key={item.href} href={item.href} className="block rounded-xl px-4 py-3 hover:bg-[#f4f4f4]"><strong className="block">{item.label}</strong><span className="text-xs text-[#777]">{item.group}</span></Link>) : <p className="p-4 text-sm text-[#666]">No matching portal page.</p>}</div></section></div> : null}
    </div>
  )
}
