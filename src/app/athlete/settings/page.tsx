'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { selectProfileCompat } from '@/lib/profileSchemaCompat'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import Toast from '@/components/Toast'
import ExportButtons from '@/components/ExportButtons'
import LoadingState from '@/components/LoadingState'
import ManagePlanModal from '@/components/ManagePlanModal'
import MobileSectionJumpNav from '@/components/MobileSectionJumpNav'
import { ATHLETE_PROFILE_LIMITS, formatTierName, normalizeAthleteTier } from '@/lib/planRules'
import { useAthleteProfile } from '@/components/AthleteProfileContext'
import {
  buildNotificationPrefs,
  mergeNotificationPrefs,
  toCategoryKey,
  type NotificationPrefs,
} from '@/lib/notificationPrefs'

type IntegrationSettings = {
  calendarProvider: 'none' | 'google'
  videoProvider: 'zoom' | 'google_meet' | 'custom'
  customVideoLink: string
  connections: {
    google: { connected: boolean; connected_at?: string }
    zoom: { connected: boolean; connected_at?: string }
  }
}

type GuardianLink = {
  id: string
  relationship: string
  created_at?: string | null
  athlete_id: string
  guardian_user_id: string
  related_profile?: {
    id?: string | null
    full_name?: string | null
    email?: string | null
    role?: string | null
    account_owner_type?: string | null
  } | null
}

type PendingGuardianInvite = {
  id: string
  guardian_email?: string | null
  status: string
  expires_at?: string | null
  created_at?: string | null
}

type AthletePrivacySettings = {
  allowDirectMessages: boolean
  blockedCoaches: string
}

const defaultPrivacySettings: AthletePrivacySettings = {
  allowDirectMessages: true,
  blockedCoaches: '',
}

const sanitizePrivacySettings = (value?: unknown): AthletePrivacySettings => {
  const raw = value && typeof value === 'object' ? (value as Partial<Record<keyof AthletePrivacySettings, unknown>>) : {}
  return {
    allowDirectMessages: raw.allowDirectMessages !== false,
    blockedCoaches: typeof raw.blockedCoaches === 'string' ? raw.blockedCoaches : '',
  }
}

const defaultCommunicationSettings = {
  email: true,
  push: false,
}

const toEmailOnlyNotificationPrefs = (prefs: NotificationPrefs) => {
  return Object.entries(prefs).reduce<NotificationPrefs>((acc, [key, value]) => {
    acc[key] = { ...value, push: false }
    return acc
  }, {})
}

const defaultIntegrationSettings: IntegrationSettings = {
  calendarProvider: 'none',
  videoProvider: 'zoom',
  customVideoLink: '',
  connections: {
    google: { connected: false },
    zoom: { connected: false },
  },
}

const formatShortDateTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function AthleteSettingsPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const { reloadProfiles, activeSubProfileId: contextActiveSubProfileId, setActiveSubProfileId: setContextActiveSubProfileId } = useAthleteProfile()
  const [avatarUrl, setAvatarUrl] = useState<string>('/avatar-athlete-placeholder.png')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const showUploadHint = avatarUrl.includes('placeholder')
  const [athleteTier, setAthleteTier] = useState<'explore' | 'train' | 'family'>('explore')
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; sport: string; avatar_url?: string | null; bio?: string | null; birthdate?: string | null; grade_level?: string | null; season?: string | null; location?: string | null }>>([])
  const [activeProfileId, setActiveProfileId] = useState('')
  const [showAddProfileModal, setShowAddProfileModal] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileSport, setNewProfileSport] = useState('')
  const [addProfileLoading, setAddProfileLoading] = useState(false)
  const [subProfileName, setSubProfileName] = useState('')
  const [subProfileSport, setSubProfileSport] = useState('')
  const [subProfileBio, setSubProfileBio] = useState('')
  const [subProfileSeason, setSubProfileSeason] = useState('')
  const [subProfileGrade, setSubProfileGrade] = useState('')
  const [subProfileBirthdate, setSubProfileBirthdate] = useState('')
  const [subProfileLocation, setSubProfileLocation] = useState('')
  const [subProfileSaving, setSubProfileSaving] = useState(false)
  const [subProfileNotice, setSubProfileNotice] = useState('')
  const [subProfileAvatarUrl, setSubProfileAvatarUrl] = useState<string>('/avatar-athlete-placeholder.png')
  const [subProfileAvatarUploading, setSubProfileAvatarUploading] = useState(false)
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [guardianName, setGuardianName] = useState('')
  const [guardianEmail, setGuardianEmail] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [guardianNotice, setGuardianNotice] = useState('')
  const [guardianSaving, setGuardianSaving] = useState(false)
  const [guardianLinks, setGuardianLinks] = useState<GuardianLink[]>([])
  const [pendingGuardianInvites, setPendingGuardianInvites] = useState<PendingGuardianInvite[]>([])
  const [guardianLinksMode, setGuardianLinksMode] = useState<'guardian' | 'athlete'>('athlete')
  const [guardianLinksLoading, setGuardianLinksLoading] = useState(false)
  const [deletingGuardianItemId, setDeletingGuardianItemId] = useState<string | null>(null)
  const [athleteLinkEmail, setAthleteLinkEmail] = useState('')
  const [guardianLinkNotice, setGuardianLinkNotice] = useState('')
  const [guardianLinkSaving, setGuardianLinkSaving] = useState(false)
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null)
  const [fullName, setFullName] = useState<string>('')
  const [athleteSeason, setAthleteSeason] = useState('')
  const [athleteGrade, setAthleteGrade] = useState('')
  const [athleteBirthdate, setAthleteBirthdate] = useState('')
  const [athleteSport, setAthleteSport] = useState('')
  const [athleteLocation, setAthleteLocation] = useState('')
  const [athleteBio, setAthleteBio] = useState('')
  const [accountOwnerType, setAccountOwnerType] = useState<'athlete_adult' | 'athlete_minor' | 'guardian'>(
    'athlete_adult',
  )
  const [guardianApprovalRule, setGuardianApprovalRule] = useState<'required' | 'notify' | 'none'>('required')
  const [securityEmail, setSecurityEmail] = useState('')
  const [originalSecurityEmail, setOriginalSecurityEmail] = useState('')
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [twoFactorMethod, setTwoFactorMethod] = useState<'off' | 'authenticator'>('off')
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null)
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null)
  const [mfaQr, setMfaQr] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaNotice, setMfaNotice] = useState('')
  const [mfaModalOpen, setMfaModalOpen] = useState(false)
  const [securityNotice, setSecurityNotice] = useState('')
  const [securitySaving, setSecuritySaving] = useState(false)
  const [profileNotice, setProfileNotice] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [planNotice, setPlanNotice] = useState('')
  const [emergencyContacts, setEmergencyContacts] = useState([
    { name: '', relationship: '', email: '', phone: '' },
    { name: '', relationship: '', email: '', phone: '' },
  ])
  const [emergencyNotice, setEmergencyNotice] = useState('')
  const [emergencySaving, setEmergencySaving] = useState(false)
  const [showEmergencyCards, setShowEmergencyCards] = useState(false)
  const notificationCategories = useMemo(() => ['Sessions', 'Messages', 'Payments', 'Marketplace'], [])
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(
    () => toEmailOnlyNotificationPrefs(buildNotificationPrefs(notificationCategories))
  )
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationNotice, setNotificationNotice] = useState('')
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string | null>(null)
  const [privacySettings, setPrivacySettings] = useState<AthletePrivacySettings>(defaultPrivacySettings)
  const [privacySaving, setPrivacySaving] = useState(false)
  const [privacyNotice, setPrivacyNotice] = useState('')
  const [communicationSettings, setCommunicationSettings] = useState(defaultCommunicationSettings)
  const [communicationSaving, setCommunicationSaving] = useState(false)
  const [communicationNotice, setCommunicationNotice] = useState('')
  const [connectionsModalOpen, setConnectionsModalOpen] = useState(false)
  const [connectionsLoading, setConnectionsLoading] = useState(false)
  const [connectionsNotice, setConnectionsNotice] = useState('')
  const [connectedIdentities, setConnectedIdentities] = useState<
    Array<{ id: string; provider: string; email?: string; created_at?: string }>
  >([])
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(defaultIntegrationSettings)
  const [integrationSaving, setIntegrationSaving] = useState(false)
  const [integrationNotice, setIntegrationNotice] = useState('')
  const [integrationConnecting, setIntegrationConnecting] = useState<Record<string, boolean>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [accountNotice, setAccountNotice] = useState('')
  const [cancelSubscriptionModalOpen, setCancelSubscriptionModalOpen] = useState(false)
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false)
  const [managePlanModalOpen, setManagePlanModalOpen] = useState(false)
  const [accountActionLoading, setAccountActionLoading] = useState<'cancel' | 'delete' | null>(null)
  const [savedFlags, setSavedFlags] = useState({
    profile: false,
    family: false,
    notifications: false,
    security: false,
    privacy: false,
    communication: false,
    integrations: false,
  })
  const [toast, setToast] = useState('')

  const triggerSaved = useCallback((key: keyof typeof savedFlags) => {
    setSavedFlags((prev) => ({ ...prev, [key]: true }))
    window.setTimeout(() => {
      setSavedFlags((prev) => ({ ...prev, [key]: false }))
    }, 2000)
  }, [])

  const applyNotificationPreset = (preset: 'minimal' | 'standard' | 'all') => {
    if (preset === 'minimal') {
      const next = buildNotificationPrefs(notificationCategories)
      Object.keys(next).forEach((key) => {
        next[key] = { email: false, push: false }
      })
      next.sessions = { email: true, push: false }
      next.payments = { email: true, push: false }
      setNotificationPrefs(next)
      return
    }
    if (preset === 'standard') {
      const next = buildNotificationPrefs(notificationCategories)
      Object.keys(next).forEach((key) => {
        next[key] = { email: true, push: false }
      })
      setNotificationPrefs(next)
      return
    }
    const next = buildNotificationPrefs(notificationCategories)
    Object.keys(next).forEach((key) => {
      next[key] = { email: true, push: false }
    })
    setNotificationPrefs(next)
  }

  const handleSaveNotifications = async () => {
    setNotificationSaving(true)
    setNotificationNotice('')
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setNotificationNotice('Please sign in to save notification settings.')
      setNotificationSaving(false)
      return
    }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, notification_prefs: toEmailOnlyNotificationPrefs(notificationPrefs) })
    if (error) {
      setNotificationNotice('Unable to save notification settings.')
      setToast('Unable to save notification settings.')
    } else {
      setNotificationNotice('Notification preferences saved.')
      triggerSaved('notifications')
    }
    setNotificationSaving(false)
  }

  const handleSavePrivacy = async () => {
    setPrivacySaving(true)
    setPrivacyNotice('')
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setPrivacyNotice('Please sign in to save privacy settings.')
      setPrivacySaving(false)
      return
    }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, athlete_privacy_settings: privacySettings, guardian_email: guardianEmail || null })
    if (error) {
      setPrivacyNotice('Unable to save privacy settings.')
      setToast('Unable to save privacy settings.')
    } else {
      setPrivacyNotice('Privacy settings saved.')
      triggerSaved('privacy')
    }
    setPrivacySaving(false)
  }

  const handleSaveCommunication = async () => {
    setCommunicationSaving(true)
    setCommunicationNotice('')
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setCommunicationNotice('Please sign in to save communication preferences.')
      setCommunicationSaving(false)
      return
    }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, athlete_communication_settings: { ...communicationSettings, push: false } })
    if (error) {
      setCommunicationNotice('Unable to save communication preferences.')
      setToast('Unable to save communication preferences.')
    } else {
      setCommunicationNotice('Communication preferences saved.')
      triggerSaved('communication')
    }
    setCommunicationSaving(false)
  }

  const persistIntegrations = async (nextSettings: IntegrationSettings, notice?: string) => {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setIntegrationNotice('Please sign in to save integrations.')
      return false
    }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, integration_settings: nextSettings })
    if (error) {
      setIntegrationNotice('Unable to save integrations.')
      return false
    }
    if (notice) {
      setIntegrationNotice(notice)
    }
    return true
  }

  const handleSaveIntegrations = async () => {
    setIntegrationSaving(true)
    setIntegrationNotice('')
    const ok = await persistIntegrations(integrationSettings, 'Integrations saved.')
    if (ok) triggerSaved('integrations')
    setIntegrationSaving(false)
  }

  const handleConnectProvider = async (provider: 'google' | 'zoom') => {
    setIntegrationConnecting((prev) => ({ ...prev, [provider]: true }))
    const returnTo = encodeURIComponent('/athlete/settings?integration=connected')
    window.open(`/api/integrations/${provider}/connect?returnTo=${returnTo}`, '_blank', 'noopener,noreferrer')
  }

  const handleDisconnectProvider = async (provider: 'google' | 'zoom') => {
    setIntegrationConnecting((prev) => ({ ...prev, [provider]: true }))
    const response = await fetch(`/api/integrations/${provider}/disconnect`, { method: 'POST' })
    if (!response.ok) {
      setIntegrationNotice('Unable to disconnect integration.')
      setIntegrationConnecting((prev) => ({ ...prev, [provider]: false }))
      return
    }
    const payload = await response.json().catch(() => null)
    if (payload?.integration_settings) {
      setIntegrationSettings(payload.integration_settings as IntegrationSettings)
    } else {
      setIntegrationSettings((prev) => ({
        ...prev,
        connections: {
          ...prev.connections,
          google: provider === 'google' ? { connected: false } : prev.connections.google,
          zoom: provider === 'zoom' ? { connected: false } : prev.connections.zoom,
        },
      }))
    }
    setIntegrationNotice(`${provider === 'google' ? 'Google' : 'Zoom'} disconnected.`)
    setIntegrationConnecting((prev) => ({ ...prev, [provider]: false }))
  }

  const handleOpenConnections = async () => {
    setConnectionsModalOpen(true)
    setConnectionsNotice('')
    setConnectionsLoading(true)
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (!user) {
      setConnectionsNotice('Please sign in to view connections.')
      setConnectionsLoading(false)
      return
    }
    const identities = (user.identities || []).map((identity) => ({
      id: identity.id,
      provider: identity.provider,
      email: (identity as any).identity_data?.email || (identity as any).identity_data?.preferred_username || '',
      created_at: identity.created_at,
    }))
    setConnectedIdentities(identities)
    setConnectionsLoading(false)
  }

  const handleDisconnectIdentity = async (identityId: string) => {
    setConnectionsNotice('')
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (!user) {
      setConnectionsNotice('Please sign in to manage connections.')
      setConnectionsLoading(false)
      return
    }
    const identity = (user.identities || []).find((item) => item.id === identityId)
    if (!identity) {
      setConnectionsLoading(false)
      return
    }
    setConnectionsLoading(true)
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) {
      setConnectionsNotice(error.message || 'Unable to disconnect identity.')
      setConnectionsLoading(false)
      return
    }
    setConnectedIdentities((prev) => prev.filter((item) => item.id !== identityId))
    setConnectionsNotice('Connection removed.')
    setConnectionsLoading(false)
  }
  const handleCancelSubscription = async () => {
    setAccountActionLoading('cancel')
    setAccountNotice('')
    const response = await fetch('/api/account/subscription/cancel', {
      method: 'POST',
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload?.error || 'Unable to cancel subscription.'
      setAccountNotice(message)
      setToast(message)
      setAccountActionLoading(null)
      return
    }
    setCancelSubscriptionModalOpen(false)
    setAccountActionLoading(null)
    window.location.assign('/athlete/dashboard?billing=cancel_scheduled')
  }

  const handleDeleteAccount = async () => {
    setAccountActionLoading('delete')
    setAccountNotice('')
    const response = await fetch('/api/account/delete', {
      method: 'POST',
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload?.error || 'Unable to delete account.'
      setAccountNotice(message)
      setToast(message)
      setAccountActionLoading(null)
      return
    }
    await supabase.auth.signOut().catch(() => null)
    setAccountActionLoading(null)
    window.location.assign('/')
  }
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0]
  const profileLimit = ATHLETE_PROFILE_LIMITS[athleteTier]
  const tierLabel = formatTierName(athleteTier)
  const canAddProfile = profileLimit === null || profiles.length < profileLimit
  const familySaving = guardianSaving || emergencySaving
  const guardianInfoSaved = Boolean(
    guardianName.trim() && guardianEmail.trim() && guardianPhone.trim(),
  )
  const emergencyContactsSaved = emergencyContacts
    .slice(0, 2)
    .every((contact) => Boolean(contact.name && contact.relationship && (contact.phone || contact.email)))
  const passwordMismatch = Boolean(
    newPassword.trim() && confirmPassword.trim() && newPassword.trim() !== confirmPassword.trim()
  )
  const birthdateValue = athleteBirthdate ? new Date(`${athleteBirthdate}T00:00:00`) : null
  const birthdateAge =
    birthdateValue && !Number.isNaN(birthdateValue.getTime())
      ? new Date().getFullYear() -
        birthdateValue.getFullYear() -
        (new Date().setFullYear(birthdateValue.getFullYear()) < birthdateValue.getTime() ? 1 : 0)
      : null
  const needsGuardianApproval =
    accountOwnerType === 'athlete_minor' ||
    accountOwnerType === 'guardian' ||
    (birthdateAge !== null && birthdateAge < 18)

  // Populate sub-profile editing fields when active profile changes
  useEffect(() => {
    if (!activeProfile || activeProfile.id === currentUserId) return
    setSubProfileName(activeProfile.name || '')
    setSubProfileSport(activeProfile.sport || '')
    setSubProfileBio(activeProfile.bio || '')
    setSubProfileSeason(activeProfile.season || '')
    setSubProfileGrade(activeProfile.grade_level || '')
    setSubProfileBirthdate(activeProfile.birthdate || '')
    setSubProfileLocation(activeProfile.location || '')
    setSubProfileAvatarUrl(activeProfile.avatar_url || '/avatar-athlete-placeholder.png')
  }, [activeProfile, currentUserId])

  useEffect(() => {
    if (!currentUserId) return
    setActiveProfileId(contextActiveSubProfileId || currentUserId)
  }, [contextActiveSubProfileId, currentUserId])

  useEffect(() => {
    let mounted = true
    const loadAvatar = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      const userId = user?.id || null
      const cachedMainAthleteLabel =
        typeof window !== 'undefined'
          ? (window.localStorage.getItem('ch_main_athlete_label') || window.localStorage.getItem('ch_full_name') || '').trim()
          : ''
      if (mounted) {
        setCurrentUserId(userId)
        setSecurityEmail(user?.email ?? '')
        setOriginalSecurityEmail(user?.email ?? '')
        setLastSignInAt(user?.last_sign_in_at ?? null)
        if (userId && user) {
          const fallbackName =
            cachedMainAthleteLabel ||
            (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
            (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
            'Athlete'
          setProfiles([{ id: userId, name: fallbackName, sport: 'General' }])
          setActiveProfileId(contextActiveSubProfileId || userId)
          const subRes = await fetch('/api/athlete/profiles')
          if (subRes.ok && mounted) {
            const subProfiles: Array<{ id: string; name: string; sport: string; avatar_url?: string | null; bio?: string | null; birthdate?: string | null; grade_level?: string | null; season?: string | null; location?: string | null }> = await subRes.json().catch(() => [])
            setProfiles((prev) => {
              const mainProfile = prev.find((profile) => profile.id === userId) || { id: userId, name: fallbackName, sport: 'General' }
              return [
                mainProfile,
                ...subProfiles.map((p) => ({ id: p.id, name: p.name, sport: p.sport, avatar_url: p.avatar_url, bio: p.bio, birthdate: p.birthdate, grade_level: p.grade_level, season: p.season, location: p.location })),
              ]
            })
          }
        }
      }
      if (!userId) return
      const { data: profileRow } = await selectProfileCompat({
        supabase,
        userId,
        columns: [
          'full_name',
          'avatar_url',
          'guardian_name',
          'guardian_email',
          'guardian_phone',
          'athlete_season',
          'athlete_grade_level',
          'athlete_birthdate',
          'athlete_sport',
          'athlete_location',
          'bio',
          'guardian_approval_rule',
          'account_owner_type',
          'notification_prefs',
          'athlete_privacy_settings',
          'athlete_communication_settings',
          'integration_settings',
          'updated_at',
        ],
      })
      const athleteProfile = (profileRow || null) as {
        full_name?: string | null
        avatar_url?: string | null
        guardian_name?: string | null
        guardian_email?: string | null
        guardian_phone?: string | null
        athlete_season?: string | null
        athlete_grade_level?: string | null
        athlete_birthdate?: string | null
        athlete_sport?: string | null
        athlete_location?: string | null
        bio?: string | null
        guardian_approval_rule?: string | null
        account_owner_type?: string | null
        notification_prefs?: unknown
        athlete_privacy_settings?: unknown
        athlete_communication_settings?: unknown
        integration_settings?: unknown
        updated_at?: string | null
      } | null
      if (mounted && athleteProfile?.avatar_url) {
        setAvatarUrl(athleteProfile.avatar_url)
      }
      if (mounted) {
        setProfiles((prev) => {
          const rest = prev.filter((profile) => profile.id !== userId)
          const resolvedMainName =
            athleteProfile?.full_name?.trim() ||
            cachedMainAthleteLabel ||
            prev.find((profile) => profile.id === userId)?.name ||
            'Athlete'
          return [
            {
              id: userId,
              name: resolvedMainName,
              sport: athleteProfile?.athlete_sport || 'General',
              avatar_url: athleteProfile?.avatar_url || null,
              bio: athleteProfile?.bio || '',
              birthdate: athleteProfile?.athlete_birthdate || '',
              grade_level: athleteProfile?.athlete_grade_level || '',
              season: athleteProfile?.athlete_season || '',
              location: athleteProfile?.athlete_location || '',
            },
            ...rest,
          ]
        })
        if (athleteProfile?.full_name?.trim() && typeof window !== 'undefined') {
          const resolvedMainName = athleteProfile.full_name.trim()
          window.localStorage.setItem('ch_full_name', resolvedMainName)
          window.localStorage.setItem('ch_main_athlete_label', resolvedMainName)
          window.dispatchEvent(new CustomEvent('ch:name-updated', { detail: { name: resolvedMainName } }))
        }
        setGuardianName(athleteProfile?.guardian_name || '')
        setGuardianEmail(athleteProfile?.guardian_email || '')
        setGuardianPhone(athleteProfile?.guardian_phone || '')
        setFullName(athleteProfile?.full_name?.trim() || cachedMainAthleteLabel || '')
        setAthleteSeason(athleteProfile?.athlete_season || '')
        setAthleteGrade(athleteProfile?.athlete_grade_level || '')
        setAthleteBirthdate(athleteProfile?.athlete_birthdate || '')
        setAthleteSport(athleteProfile?.athlete_sport || '')
        setAthleteLocation(athleteProfile?.athlete_location || '')
        setAthleteBio(athleteProfile?.bio || '')
        setGuardianApprovalRule((athleteProfile?.guardian_approval_rule as 'none' | 'required' | 'notify' | null) || 'required')
        setAccountOwnerType((athleteProfile?.account_owner_type as 'athlete_adult' | 'athlete_minor' | 'guardian' | null) || 'athlete_adult')
        setProfileUpdatedAt(athleteProfile?.updated_at || null)
        if (athleteProfile?.athlete_privacy_settings) {
          setPrivacySettings(sanitizePrivacySettings(athleteProfile.athlete_privacy_settings))
        }
        if (athleteProfile?.athlete_communication_settings) {
          setCommunicationSettings({
            ...defaultCommunicationSettings,
            ...(athleteProfile.athlete_communication_settings as Partial<typeof defaultCommunicationSettings>),
            push: false,
          })
        }
        if (athleteProfile?.integration_settings) {
          setIntegrationSettings({
            ...defaultIntegrationSettings,
            ...(athleteProfile.integration_settings as Partial<IntegrationSettings>),
            connections: {
              ...defaultIntegrationSettings.connections,
              ...(athleteProfile.integration_settings as Partial<IntegrationSettings>).connections,
            },
          })
        }
        if (athleteProfile?.notification_prefs) {
          const defaults = buildNotificationPrefs(notificationCategories)
          setNotificationPrefs(
            toEmailOnlyNotificationPrefs(
              mergeNotificationPrefs(defaults, athleteProfile.notification_prefs),
            ),
          )
        }
      }
    }
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as { url?: string } | undefined
      if (detail?.url) setAvatarUrl(detail.url)
    }
    loadAvatar()
    window.addEventListener('ch:avatar-updated', onAvatarUpdated)
    return () => {
      mounted = false
      window.removeEventListener('ch:avatar-updated', onAvatarUpdated)
    }
  }, [contextActiveSubProfileId, notificationCategories, supabase])

  useEffect(() => {
    let active = true
    const loadMfa = async () => {
      const mfa = (supabase.auth as any).mfa
      if (!mfa?.listFactors) return
      const { data, error } = await mfa.listFactors()
      if (!active) return
      if (error) return
      const verified = data?.totp?.[0] ?? null
      setVerifiedFactorId(verified?.id ?? null)
      setTwoFactorMethod(verified ? 'authenticator' : 'off')
    }
    loadMfa()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadConnections = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!active) return
      const identities = (user?.identities || []).map((identity) => ({
        id: identity.id,
        provider: identity.provider,
        email: (identity as any).identity_data?.email || (identity as any).identity_data?.preferred_username || '',
        created_at: identity.created_at,
      }))
      setConnectedIdentities(identities)
    }
    loadConnections()
    return () => {
      active = false
    }
  }, [supabase])

  const loadAthleteFamilyProfile = useCallback(async () => {
    if (!currentUserId) return
    const { data: profileRow, error } = await supabase
      .from('profiles')
      .select('guardian_name, guardian_email, guardian_phone, guardian_approval_rule, account_owner_type')
      .eq('id', currentUserId)
      .maybeSingle()

    if (error) {
      return null
    }

    const athleteProfile = (profileRow || null) as {
      guardian_name?: string | null
      guardian_email?: string | null
      guardian_phone?: string | null
      guardian_approval_rule?: string | null
      account_owner_type?: string | null
    } | null

    setGuardianName(athleteProfile?.guardian_name || '')
    setGuardianEmail(athleteProfile?.guardian_email || '')
    setGuardianPhone(athleteProfile?.guardian_phone || '')
    setGuardianApprovalRule((athleteProfile?.guardian_approval_rule as 'none' | 'required' | 'notify' | null) || 'required')
    setAccountOwnerType((athleteProfile?.account_owner_type as 'athlete_adult' | 'athlete_minor' | 'guardian' | null) || 'athlete_adult')
    return athleteProfile
  }, [currentUserId, supabase])

  const loadEmergencyContacts = useCallback(async () => {
    const response = await fetch('/api/emergency-contacts')
    if (!response.ok) return null
    const payload = await response.json()
    const contacts = Array.isArray(payload.contacts) ? payload.contacts : []
    const next = [
      { name: '', relationship: '', email: '', phone: '' },
      { name: '', relationship: '', email: '', phone: '' },
    ]
    contacts.forEach((contact: any) => {
      const index = Number(contact.contact_index) - 1
      if (index >= 0 && index < next.length) {
        next[index] = {
          name: contact.name || '',
          relationship: contact.relationship || '',
          email: contact.email || '',
          phone: contact.phone || '',
        }
      }
    })
    setEmergencyContacts(next)
    setShowEmergencyCards(
      next.some((contact) => Boolean(contact.name || contact.relationship || contact.email || contact.phone)),
    )
    return next
  }, [])

  const loadGuardianLinks = useCallback(async () => {
    if (!currentUserId) return
    setGuardianLinksLoading(true)
    setGuardianLinkNotice('')
    const response = await fetch('/api/guardian-links')
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setGuardianLinks([])
      setPendingGuardianInvites([])
      setGuardianLinksLoading(false)
      return
    }
    setGuardianLinks((payload?.links || []) as GuardianLink[])
    setPendingGuardianInvites((payload?.pending_invites || []) as PendingGuardianInvite[])
    setGuardianLinksMode(payload?.mode === 'guardian' ? 'guardian' : 'athlete')
    setGuardianLinksLoading(false)
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) return
    loadGuardianLinks()
  }, [currentUserId, loadGuardianLinks])

  useEffect(() => {
    if (needsGuardianApproval && guardianApprovalRule !== 'required') {
      setGuardianApprovalRule('required')
    }
  }, [guardianApprovalRule, needsGuardianApproval])

  useEffect(() => {
    let active = true
    const loadTier = async () => {
      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (!userId) return
      const { data: planRow } = await supabase
        .from('athlete_plans')
        .select('tier')
        .eq('athlete_id', userId)
        .maybeSingle()
      if (!active) return
      const savedTier = typeof planRow?.tier === 'string' ? planRow.tier : null
      if (savedTier) {
        setAthleteTier(normalizeAthleteTier(savedTier))
      }
    }
    loadTier()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (profileLimit === null) {
      setPlanNotice('')
      return
    }
    if (profiles.length >= profileLimit) {
      setPlanNotice(`Your ${tierLabel} plan allows up to ${profileLimit} athlete profile${profileLimit === 1 ? '' : 's'}.`)
    } else {
      setPlanNotice('')
    }
  }, [profileLimit, profiles.length, tierLabel])

  useEffect(() => {
    void loadEmergencyContacts()
  }, [loadEmergencyContacts])

  useEffect(() => {
    if (!currentUserId) return
    void loadAthleteFamilyProfile()
  }, [currentUserId, loadAthleteFamilyProfile])

  const handleAvatarChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/storage/avatar', {
      method: 'POST',
      body: formData,
    })
    if (response.ok) {
      const data = await response.json()
      setAvatarUrl(data.url)
      setProfiles((prev) => prev.map((profile) => (
        profile.id === currentUserId ? { ...profile, avatar_url: data.url } : profile
      )))
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ch_avatar_url', data.url)
        window.dispatchEvent(new CustomEvent('ch:avatar-updated', { detail: { url: data.url } }))
      }
    }
    setAvatarUploading(false)
    event.target.value = ''
  }, [currentUserId])

  const handleSubProfileAvatarChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    if (!activeProfile || activeProfile.id === currentUserId) return
    const file = event.target.files?.[0]
    if (!file) return
    setSubProfileAvatarUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('sub_profile_id', activeProfile.id)
    const response = await fetch('/api/storage/avatar', { method: 'POST', body: formData })
    if (response.ok) {
      const data = await response.json()
      setSubProfileAvatarUrl(data.url)
      setProfiles((prev) => prev.map((p) => p.id === activeProfile.id ? { ...p, avatar_url: data.url } : p))
      await reloadProfiles()
    }
    setSubProfileAvatarUploading(false)
    event.target.value = ''
  }, [activeProfile, currentUserId, reloadProfiles])

  const handleAddProfile = async () => {
    if (!canAddProfile) {
      setPlanNotice('Upgrade to add more athlete profiles.')
      return
    }
    const name = newProfileName.trim()
    if (!name) return
    setAddProfileLoading(true)
    const res = await fetch('/api/athlete/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sport: newProfileSport.trim() || 'General' }),
    })
    const payload = await res.json().catch(() => null)
    setAddProfileLoading(false)
    if (!res.ok) {
      setToast(payload?.error || 'Unable to add profile.')
      return
    }
    setProfiles((prev) => [...prev, { id: payload.id, name: payload.name, sport: payload.sport }])
    setActiveProfileId(payload.id)
    setContextActiveSubProfileId(payload.id)
    setNewProfileName('')
    setNewProfileSport('')
    setShowAddProfileModal(false)
    reloadProfiles()
  }

  const handleSaveSubProfile = async () => {
    if (!activeProfile || activeProfile.id === currentUserId) return
    setSubProfileSaving(true)
    setSubProfileNotice('')
    const res = await fetch(`/api/athlete/profiles/${activeProfile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: subProfileName.trim() || activeProfile.name,
        sport: subProfileSport.trim() || activeProfile.sport,
        bio: subProfileBio.trim() || null,
        birthdate: subProfileBirthdate || null,
        grade_level: subProfileGrade || null,
        season: subProfileSeason || null,
        location: subProfileLocation.trim() || null,
      }),
    })
    setSubProfileSaving(false)
    if (!res.ok) {
      setSubProfileNotice('Unable to save profile.')
      setToast('Unable to save profile.')
      return
    }
    const updated = await res.json().catch(() => null)
    if (updated) {
      setProfiles((prev) => prev.map((p) =>
        p.id === activeProfile.id
          ? { ...p, name: updated.name, sport: updated.sport, avatar_url: updated.avatar_url, bio: updated.bio, birthdate: updated.birthdate, grade_level: updated.grade_level, season: updated.season, location: updated.location }
          : p
      ))
    }
    reloadProfiles()
    setSubProfileNotice('Profile saved.')
  }

  const handleDeleteSubProfile = async (profileId: string) => {
    if (!profileId || profileId === currentUserId) return
    setDeletingProfileId(profileId)
    const res = await fetch(`/api/athlete/profiles/${profileId}`, { method: 'DELETE' })
    setDeletingProfileId(null)
    if (!res.ok) {
      setToast('Unable to delete profile.')
      return
    }
    setProfiles((prev) => prev.filter((p) => p.id !== profileId))
    if (activeProfileId === profileId) {
      setActiveProfileId(currentUserId || '')
      setContextActiveSubProfileId(null)
    }
    reloadProfiles()
  }

  const handleSaveGuardian = useCallback(async () => {
    if (!currentUserId) {
      setGuardianNotice('Sign in to save guardian info.')
      return false
    }
    setGuardianSaving(true)
    setGuardianNotice('')
    const expectedGuardianName = guardianName.trim() || null
    const expectedGuardianEmail = guardianEmail.trim() || null
    const expectedGuardianPhone = guardianPhone.trim() || null
    const expectedApprovalRule = needsGuardianApproval ? 'required' : guardianApprovalRule
    const expectedOwnerType = accountOwnerType
    const response = await fetch('/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guardian_name: expectedGuardianName,
        guardian_email: expectedGuardianEmail,
        guardian_phone: expectedGuardianPhone,
        guardian_approval_rule: expectedApprovalRule,
        account_owner_type: expectedOwnerType,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload?.error || 'Unable to save guardian info.'
      setGuardianNotice(message)
      setToast(message)
      setGuardianSaving(false)
      return false
    }

    const savedProfile = (payload?.profile || null) as {
      guardian_name?: string | null
      guardian_email?: string | null
      guardian_phone?: string | null
      guardian_approval_rule?: string | null
      account_owner_type?: string | null
    } | null

    const guardianRoundTripOk =
      (savedProfile?.guardian_name || null) === expectedGuardianName &&
      (savedProfile?.guardian_email || null) === expectedGuardianEmail &&
      (savedProfile?.guardian_phone || null) === expectedGuardianPhone &&
      (savedProfile?.guardian_approval_rule || null) === expectedApprovalRule &&
      (savedProfile?.account_owner_type || null) === expectedOwnerType

    const reloadedProfile = guardianRoundTripOk ? savedProfile : await loadAthleteFamilyProfile()
    const guardianReloadOk =
      (reloadedProfile?.guardian_name || null) === expectedGuardianName &&
      (reloadedProfile?.guardian_email || null) === expectedGuardianEmail &&
      (reloadedProfile?.guardian_phone || null) === expectedGuardianPhone &&
      (reloadedProfile?.guardian_approval_rule || null) === expectedApprovalRule &&
      (reloadedProfile?.account_owner_type || null) === expectedOwnerType

    if (!guardianReloadOk) {
      const message = 'Guardian info did not persist. Check the database fields and try again.'
      setGuardianNotice(message)
      setToast(message)
    } else {
      let guardianMessage = 'Guardian info saved.'
      if (expectedGuardianEmail) {
        const inviteResponse = await fetch('/api/guardian-invites/request', { method: 'POST' })
        const invitePayload = await inviteResponse.json().catch(() => null)
        if (inviteResponse.ok) {
          guardianMessage = invitePayload?.linked
            ? 'Guardian info saved. Guardian account linked.'
            : 'Guardian info saved. Invite sent to guardian email.'
          await loadGuardianLinks()
        } else if (invitePayload?.error) {
          guardianMessage = invitePayload.error
          await loadGuardianLinks()
        } else {
          guardianMessage = 'Guardian info saved, but the invite state could not be refreshed.'
          await loadGuardianLinks()
        }
      }
      setGuardianNotice(guardianMessage)
      setGuardianSaving(false)
      return true
    }
    setGuardianSaving(false)
    return false
  }, [
    accountOwnerType,
    currentUserId,
    guardianApprovalRule,
    guardianEmail,
    guardianName,
    guardianPhone,
    loadAthleteFamilyProfile,
    loadGuardianLinks,
    needsGuardianApproval,
  ])

  const handleSaveEmergencyContacts = useCallback(async () => {
    setEmergencySaving(true)
    setEmergencyNotice('')
    const response = await fetch('/api/emergency-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: emergencyContacts }),
    })
    if (!response.ok) {
      setEmergencyNotice('Unable to save emergency contacts.')
      setShowEmergencyCards(false)
      setToast('Unable to save emergency contacts.')
      setEmergencySaving(false)
      return false
    } else {
      const savedContacts = await loadEmergencyContacts()
      if (!savedContacts) {
        setEmergencyNotice('Emergency contacts were saved, but could not be reloaded.')
        setEmergencySaving(false)
        return false
      }
      setEmergencyNotice('Emergency contacts saved.')
    }
    setEmergencySaving(false)
    return true
  }, [emergencyContacts, loadEmergencyContacts])

  const handleSaveFamily = useCallback(async () => {
    const guardianSaved = await handleSaveGuardian()
    const emergencySaved = await handleSaveEmergencyContacts()
    await loadAthleteFamilyProfile()
    await loadEmergencyContacts()
    await loadGuardianLinks()
    if (guardianSaved && emergencySaved) {
      triggerSaved('family')
    }
  }, [handleSaveEmergencyContacts, handleSaveGuardian, loadAthleteFamilyProfile, loadEmergencyContacts, loadGuardianLinks, triggerSaved])

  const handleLinkAthlete = useCallback(async () => {
    const trimmedEmail = athleteLinkEmail.trim().toLowerCase()
    if (!trimmedEmail) {
      setGuardianLinkNotice('Enter an athlete email to link.')
      return
    }
    setGuardianLinkSaving(true)
    setGuardianLinkNotice('')
    const response = await fetch('/api/guardian-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athlete_email: trimmedEmail }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setGuardianLinkNotice(payload?.error || 'Unable to link athlete.')
      setGuardianLinkSaving(false)
      return
    }
    setAthleteLinkEmail('')
    setGuardianLinkNotice('Athlete linked to guardian account.')
    setGuardianLinkSaving(false)
    await loadGuardianLinks()
  }, [athleteLinkEmail, loadGuardianLinks])

  const handleDeleteGuardianItem = useCallback(
    async (params: { linkId?: string; inviteId?: string; successMessage: string }) => {
      const targetId = params.linkId || params.inviteId || null
      if (!targetId) return
      setDeletingGuardianItemId(targetId)
      setGuardianLinkNotice('')
      const response = await fetch('/api/guardian-links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(params.linkId ? { link_id: params.linkId } : {}),
          ...(params.inviteId ? { invite_id: params.inviteId } : {}),
        }),
      })
      const payload = await response.json().catch(() => null)
      setDeletingGuardianItemId(null)
      if (!response.ok) {
        setGuardianLinkNotice(payload?.error || 'Unable to update guardian link.')
        return
      }
      if (params.linkId) {
        await loadAthleteFamilyProfile()
      }
      await loadGuardianLinks()
      setGuardianLinkNotice(params.successMessage)
    },
    [loadAthleteFamilyProfile, loadGuardianLinks],
  )

  const handleSaveProfile = useCallback(async () => {
    if (!currentUserId) {
      setProfileNotice('Sign in to save profile details.')
      return
    }
    setProfileSaving(true)
    setProfileNotice('')
    const res = await fetch('/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName.trim() || null,
        athlete_season: athleteSeason.trim() || null,
        athlete_grade_level: athleteGrade.trim() || null,
        athlete_birthdate: athleteBirthdate || null,
        athlete_sport: athleteSport.trim() || null,
        athlete_location: athleteLocation.trim() || null,
        bio: athleteBio.trim() || null,
      }),
    })
    if (!res.ok) {
      setProfileNotice('Unable to save profile details.')
      setToast('Unable to save profile details.')
    } else {
      const payload = await res.json().catch(() => null)
      const savedProfile = payload?.profile as {
        full_name?: string | null
        athlete_sport?: string | null
        bio?: string | null
        athlete_birthdate?: string | null
        athlete_grade_level?: string | null
        athlete_season?: string | null
        athlete_location?: string | null
        updated_at?: string | null
      } | null
      const savedName = savedProfile?.full_name?.trim() || fullName.trim()
      await supabase.auth.updateUser({ data: { full_name: savedName || null } })
      const trimmedName = fullName.trim()
      setProfiles((prev) => prev.map((profile) => (
        profile.id === currentUserId
          ? {
              ...profile,
              name: savedName || profile.name,
              sport: savedProfile?.athlete_sport || athleteSport.trim() || profile.sport,
              bio: savedProfile?.bio || athleteBio.trim() || '',
              birthdate: savedProfile?.athlete_birthdate || athleteBirthdate || '',
              grade_level: savedProfile?.athlete_grade_level || athleteGrade.trim() || '',
              season: savedProfile?.athlete_season || athleteSeason.trim() || '',
              location: savedProfile?.athlete_location || athleteLocation.trim() || '',
            }
          : profile
      )))
      if (savedName && typeof window !== 'undefined') {
        window.localStorage.setItem('ch_full_name', savedName)
        window.localStorage.setItem('ch_main_athlete_label', savedName)
        window.dispatchEvent(new CustomEvent('ch:name-updated', { detail: { name: savedName } }))
      }
      setFullName(savedName)
      setAthleteSport(savedProfile?.athlete_sport || athleteSport.trim() || '')
      setAthleteBio(savedProfile?.bio || athleteBio.trim() || '')
      setAthleteBirthdate(savedProfile?.athlete_birthdate || athleteBirthdate || '')
      setAthleteGrade(savedProfile?.athlete_grade_level || athleteGrade.trim() || '')
      setAthleteSeason(savedProfile?.athlete_season || athleteSeason.trim() || '')
      setAthleteLocation(savedProfile?.athlete_location || athleteLocation.trim() || '')
      setProfileUpdatedAt(savedProfile?.updated_at || new Date().toISOString())
      await reloadProfiles()
      router.refresh()
      setProfileNotice('Profile details saved.')
      triggerSaved('profile')
    }
    setProfileSaving(false)
  }, [athleteBio, athleteBirthdate, athleteGrade, athleteLocation, athleteSeason, athleteSport, currentUserId, fullName, reloadProfiles, router, supabase, triggerSaved])

  const handleSaveSecurity = useCallback(async () => {
    setSecuritySaving(true)
    setSecurityNotice('')
    const trimmedPassword = newPassword.trim()
    const trimmedConfirm = confirmPassword.trim()
    if ((trimmedPassword || trimmedConfirm) && trimmedPassword !== trimmedConfirm) {
      setSecurityNotice('Passwords do not match.')
      setSecuritySaving(false)
      return
    }
    const updates: { email?: string; password?: string } = {}
    const trimmedEmail = securityEmail.trim()
    const emailChanged =
      Boolean(trimmedEmail) &&
      trimmedEmail.toLowerCase() !== (originalSecurityEmail || '').trim().toLowerCase()
    if (trimmedEmail) updates.email = trimmedEmail
    if (trimmedPassword) updates.password = trimmedPassword
    if (Object.keys(updates).length) {
      const { error } = await supabase.auth.updateUser(updates)
      if (error) {
        setSecurityNotice(error.message || 'Unable to update account.')
        setToast(error.message || 'Unable to update account.')
        setSecuritySaving(false)
        return
      }
      if (emailChanged) {
        setOriginalSecurityEmail(trimmedEmail)
      }
    }
    const mfa = (supabase.auth as any).mfa
    if (twoFactorMethod === 'off' && verifiedFactorId && mfa?.unenroll) {
      const { error } = await mfa.unenroll({ factorId: verifiedFactorId })
      if (error) {
        setSecurityNotice(error.message || 'Unable to disable two-factor.')
        setToast(error.message || 'Unable to disable two-factor.')
        setSecuritySaving(false)
        return
      }
      setVerifiedFactorId(null)
    }
    if (twoFactorMethod === 'authenticator' && !verifiedFactorId && !pendingFactorId && mfa?.enroll) {
      const { data, error } = await mfa.enroll({ factorType: 'totp' })
      if (error || !data?.id) {
        setSecurityNotice(error?.message || 'Unable to start two-factor enrollment.')
        setToast(error?.message || 'Unable to start two-factor enrollment.')
        setSecuritySaving(false)
        return
      }
      setPendingFactorId(data.id)
      setMfaQr(data.totp?.qr_code ?? null)
      setMfaSecret(data.totp?.secret ?? null)
      setMfaCode('')
      setMfaNotice('')
      setMfaModalOpen(true)
      setSecurityNotice('Scan the QR code to finish setup.')
      setSecuritySaving(false)
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    setSecurityNotice(
      emailChanged
        ? 'Security settings saved. Check your inbox to confirm the new email address before it takes effect.'
        : 'Security settings saved.'
    )
    triggerSaved('security')
    setSecuritySaving(false)
  }, [
    confirmPassword,
    newPassword,
    originalSecurityEmail,
    pendingFactorId,
    securityEmail,
    supabase,
    twoFactorMethod,
    verifiedFactorId,
    triggerSaved,
  ])

  const handleSignOutOthers = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    setSecurityNotice(
      error ? (error.message || 'Unable to sign out other sessions.') : 'All other sessions signed out.'
    )
  }, [supabase])

  const handleVerifyMfa = useCallback(async () => {
    if (!pendingFactorId) return
    const trimmedCode = mfaCode.trim()
    if (!trimmedCode) {
      setMfaNotice('Enter the 6-digit code.')
      return
    }
    const mfa = (supabase.auth as any).mfa
    if (!mfa?.challengeAndVerify) {
      setMfaNotice('Two-factor verification is unavailable.')
      return
    }
    const { error } = await mfa.challengeAndVerify({ factorId: pendingFactorId, code: trimmedCode })
    if (error) {
      setMfaNotice(error.message || 'Unable to verify code.')
      return
    }
    setVerifiedFactorId(pendingFactorId)
    setTwoFactorMethod('authenticator')
    setPendingFactorId(null)
    setMfaModalOpen(false)
    setMfaQr(null)
    setMfaSecret(null)
    setMfaCode('')
    setSecurityNotice('Two-factor authentication enabled.')
    triggerSaved('security')
  }, [mfaCode, pendingFactorId, supabase, triggerSaved])

  const handleCancelMfa = useCallback(async () => {
    if (pendingFactorId) {
      const mfa = (supabase.auth as any).mfa
      if (mfa?.unenroll) {
        try {
          await mfa.unenroll({ factorId: pendingFactorId })
        } catch (error) {
          // Best-effort cleanup; allow user to exit setup.
        }
      }
    }
    setPendingFactorId(null)
    setMfaModalOpen(false)
    setMfaQr(null)
    setMfaSecret(null)
    setMfaCode('')
    setMfaNotice('')
    setTwoFactorMethod(verifiedFactorId ? 'authenticator' : 'off')
  }, [pendingFactorId, verifiedFactorId, supabase])

  const handleOpenCustomerPortal = async () => {
    const response = await fetch('/api/stripe/customer-portal', { method: 'POST' })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.url) {
      setToast(data?.error || 'Unable to open billing portal.')
      return
    }
    window.open(data.url, '_blank', 'noopener,noreferrer')
  }

  const mobileJumpSections = [
    { href: '#profile', label: 'Profile' },
    { href: '#profiles', label: 'Athletes' },
    { href: '#family', label: 'Family & safety' },
    { href: '#payments', label: 'Payments' },
    { href: '#notifications', label: 'Notifications' },
    { href: '#security', label: 'Security' },
    ...(showAdvanced
      ? [
          { href: '#integrations', label: 'Integrations' },
          { href: '#privacy', label: 'Privacy' },
          { href: '#communication', label: 'Communication' },
          { href: '#connections', label: 'Connections' },
          { href: '#export-center', label: 'Export center' },
        ]
      : []),
    { href: '#account', label: 'Account controls' },
  ]

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Settings</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Account & preferences</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Update profile, notifications, and payment details.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)_220px]">
          <AthleteSidebar />
          <div className="min-w-0 flex flex-col gap-10 [&>*]:min-w-0">
            <MobileSectionJumpNav
              sections={mobileJumpSections}
              actionLabel={showAdvanced ? undefined : 'Show advanced'}
              onAction={showAdvanced ? undefined : () => setShowAdvanced(true)}
            />
            <section id="profile" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Active athlete profile</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Edit the selected athlete. Use the switcher to update another profile.</p>
                  {profileUpdatedAt && (
                    <p className="mt-1 text-xs text-[#6b5f55]">Last updated {formatShortDateTime(profileUpdatedAt)}</p>
                  )}
                </div>
                <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="w-full rounded-full border border-[#191919] px-3 py-2 text-sm text-[#191919] sm:w-auto">
                    <label className="sr-only" htmlFor="profile-switcher">Editing athlete</label>
                    <select
                      id="profile-switcher"
                      value={activeProfileId}
                      onChange={(event) => {
                        const nextId = event.target.value
                        setActiveProfileId(nextId)
                        setContextActiveSubProfileId(nextId === currentUserId ? null : nextId)
                      }}
                      className="w-full bg-transparent text-sm font-semibold text-[#191919] focus:outline-none sm:w-auto"
                    >
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Link
                    href="/athlete/profile"
                    className="inline-flex w-full justify-center rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors sm:w-auto"
                  >
                    View profile
                  </Link>
                  {savedFlags.profile && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Saved
                    </span>
                  )}
                </div>
              </div>

              {activeProfile?.id === currentUserId ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <label
                      className="relative h-14 w-14 cursor-pointer rounded-full border-2 border-[#191919] bg-[#e8e8e8] bg-cover bg-center"
                      style={{ backgroundImage: `url(${avatarUrl})` }}
                    >
                      {showUploadHint && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xl font-semibold text-[#191919] opacity-30">
                          +
                        </span>
                      )}
                      <input
                        type="file"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Upload profile photo"
                        onChange={handleAvatarChange}
                      />
                    </label>
                    <div className="text-sm text-[#4a4a4a]">
                      <p className="font-semibold text-[#191919]">Profile photo</p>
                      <p className="text-xs">Upload an image.</p>
                    </div>
                    {avatarUploading && (
                      <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">
                        Uploading...
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Full name</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        placeholder={activeProfile?.name || "Athlete name"}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Primary sport</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        placeholder="Primary sport"
                        value={athleteSport}
                        onChange={(e) => setAthleteSport(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Season</span>
                      <select
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        value={athleteSeason}
                        onChange={(event) => setAthleteSeason(event.target.value)}
                      >
                        <option value="">Select season</option>
                        <option value="Fall">Fall</option>
                        <option value="Winter">Winter</option>
                        <option value="Spring">Spring</option>
                        <option value="Summer">Summer</option>
                        <option value="Offseason">Offseason</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Grade level</span>
                      <select
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        value={athleteGrade}
                        onChange={(event) => setAthleteGrade(event.target.value)}
                      >
                        <option value="">Select grade</option>
                        <option value="K">K</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                        <option value="7">7</option>
                        <option value="8">8</option>
                        <option value="9">9</option>
                        <option value="10">10</option>
                        <option value="11">11</option>
                        <option value="12">12</option>
                        <option value="College">College</option>
                        <option value="Post-grad">Post-grad</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Birthdate</span>
                      <input
                        type="date"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        value={athleteBirthdate}
                        onChange={(event) => setAthleteBirthdate(event.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Location</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        placeholder="Austin, TX"
                        value={athleteLocation}
                        onChange={(e) => setAthleteLocation(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-semibold text-[#191919]">Bio</span>
                      <textarea
                        rows={3}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none resize-none"
                        placeholder="Tell coaches about yourself..."
                        value={athleteBio}
                        onChange={(e) => setAthleteBio(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 transition-opacity"
                      onClick={handleSaveProfile}
                      disabled={profileSaving}
                    >
                      {profileSaving ? 'Saving...' : 'Save profile'}
                    </button>
                    {profileNotice && <span className="text-xs text-[#4a4a4a]">{profileNotice}</span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <label
                      className="relative h-14 w-14 cursor-pointer rounded-full border-2 border-[#191919] bg-[#e8e8e8] bg-cover bg-center"
                      style={{ backgroundImage: `url(${subProfileAvatarUrl})` }}
                    >
                      {subProfileAvatarUrl.includes('placeholder') && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xl font-semibold text-[#191919] opacity-30">
                          +
                        </span>
                      )}
                      <input
                        type="file"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Upload profile photo"
                        onChange={handleSubProfileAvatarChange}
                      />
                    </label>
                    <div className="text-sm text-[#4a4a4a]">
                      <p className="font-semibold text-[#191919]">Profile photo</p>
                      <p className="text-xs">Upload an image.</p>
                    </div>
                    {subProfileAvatarUploading && (
                      <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">
                        Uploading...
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Full name</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        placeholder="Athlete name"
                        value={subProfileName}
                        onChange={(e) => setSubProfileName(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Primary sport</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        placeholder="Primary sport"
                        value={subProfileSport}
                        onChange={(e) => setSubProfileSport(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Season</span>
                      <select
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        value={subProfileSeason}
                        onChange={(e) => setSubProfileSeason(e.target.value)}
                      >
                        <option value="">Select season</option>
                        <option value="Fall">Fall</option>
                        <option value="Winter">Winter</option>
                        <option value="Spring">Spring</option>
                        <option value="Summer">Summer</option>
                        <option value="Offseason">Offseason</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Grade level</span>
                      <select
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        value={subProfileGrade}
                        onChange={(e) => setSubProfileGrade(e.target.value)}
                      >
                        <option value="">Select grade</option>
                        <option value="K">K</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                        <option value="7">7</option>
                        <option value="8">8</option>
                        <option value="9">9</option>
                        <option value="10">10</option>
                        <option value="11">11</option>
                        <option value="12">12</option>
                        <option value="College">College</option>
                        <option value="Post-grad">Post-grad</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Birthdate</span>
                      <input
                        type="date"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        value={subProfileBirthdate}
                        onChange={(e) => setSubProfileBirthdate(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Location</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                        placeholder="Austin, TX"
                        value={subProfileLocation}
                        onChange={(e) => setSubProfileLocation(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-semibold text-[#191919]">Bio</span>
                      <textarea
                        rows={3}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none resize-none"
                        placeholder="Tell coaches about this athlete..."
                        value={subProfileBio}
                        onChange={(e) => setSubProfileBio(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 transition-opacity"
                      onClick={handleSaveSubProfile}
                      disabled={subProfileSaving}
                    >
                      {subProfileSaving ? 'Saving...' : 'Save profile'}
                    </button>
                    {subProfileNotice && <span className="text-xs text-[#4a4a4a]">{subProfileNotice}</span>}
                  </div>
                </>
              )}
            </section>

            <section id="profiles" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">All athlete profiles</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Manage every athlete on this account and choose who is active.</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">
                    Current plan: {tierLabel} - {profileLimit === null ? 'Unlimited profiles' : `${profileLimit} profile${profileLimit === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!canAddProfile) {
                      setPlanNotice(`Upgrade to add more athlete profiles.`)
                      return
                    }
                    setShowAddProfileModal(true)
                  }}
                  className={`rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold transition-colors ${
                    canAddProfile ? 'text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a]' : 'cursor-not-allowed text-[#9b9b9b]'
                  }`}
                  disabled={!canAddProfile}
                >
                  Add athlete
                </button>
              </div>
              {planNotice && (
                <p className="mt-2 text-xs text-[#b80f0a]">{planNotice}</p>
              )}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[#191919]">{profile.name}</p>
                        <p className="text-xs text-[#4a4a4a]">{profile.sport}</p>
                      </div>
                      {profile.id === activeProfileId ? (
                        <span className="rounded-full bg-[#191919] px-3 py-1 text-[10px] font-semibold text-white">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() => setActiveProfileId(profile.id)}
                        className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        Set active
                      </button>
                      <Link
                        href={(() => {
                          const isMain = profile.id === currentUserId
                          const slug = isMain ? currentUserId : profile.id
                          const params = new URLSearchParams({
                            id: currentUserId ?? '',
                            name: profile.name,
                            sport: profile.sport,
                          })
                          if (!isMain) params.set('sub_profile_id', profile.id)
                          return `/athlete/profiles/${slug}?${params.toString()}`
                        })()}
                        className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        Open profile
                      </Link>
                      {profile.id !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSubProfile(profile.id)}
                          disabled={deletingProfileId === profile.id}
                          className="rounded-full border border-[#b80f0a] px-3 py-1 font-semibold text-[#b80f0a] hover:bg-[#b80f0a] hover:text-white transition-colors disabled:opacity-50"
                        >
                          {deletingProfileId === profile.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="family" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Family & safety</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Guardian permissions and emergency contacts.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleSaveFamily}
                    disabled={familySaving}
                  >
                    {familySaving ? 'Saving...' : 'Save family info'}
                  </button>
                  {guardianInfoSaved && (
                    <span className="rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-1 text-xs font-semibold text-[#191919]">
                      Guardian saved
                    </span>
                  )}
                  {emergencyContactsSaved && (
                    <span className="rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-1 text-xs font-semibold text-[#191919]">
                      Contacts saved
                    </span>
                  )}
                  {savedFlags.family && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Saved
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 space-y-6 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Guardian & permissions</p>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Guardian name</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        placeholder="Parent/guardian name"
                        value={guardianName}
                        onChange={(event) => setGuardianName(event.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Primary guardian email</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        placeholder="parent@example.com"
                        value={guardianEmail}
                        onChange={(event) => setGuardianEmail(event.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Guardian phone</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        placeholder="+1 (555) 123-4567"
                        value={guardianPhone}
                        onChange={(event) => setGuardianPhone(event.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Account owner</span>
                      <select
                        value={accountOwnerType}
                        onChange={(event) =>
                          setAccountOwnerType(
                            event.target.value as 'athlete_adult' | 'athlete_minor' | 'guardian',
                          )
                        }
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="athlete_adult">Athlete (18+)</option>
                        <option value="athlete_minor">Athlete under 18</option>
                        <option value="guardian">Parent/guardian</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Approval rule</span>
                      <select
                        value={needsGuardianApproval ? 'required' : guardianApprovalRule}
                        onChange={(event) =>
                          setGuardianApprovalRule(event.target.value as 'required' | 'notify' | 'none')
                        }
                        disabled={needsGuardianApproval}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] disabled:cursor-not-allowed"
                      >
                        <option value="required">Guardian approval required</option>
                        <option value="notify">Notify only</option>
                        <option value="none">No guardian approval</option>
                      </select>
                      {needsGuardianApproval && (
                        <p className="text-[11px] text-[#4a4a4a]">Required for athletes under 18.</p>
                      )}
                    </label>
                  </div>
                  {guardianNotice && (
                    <p className="mt-3 text-xs text-[#4a4a4a]">{guardianNotice}</p>
                  )}
                  <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">
                        {guardianLinksMode === 'guardian' ? 'Linked athletes' : 'Linked guardians'}
                      </p>
                      <button
                        type="button"
                        onClick={loadGuardianLinks}
                        className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        Refresh
                      </button>
                    </div>
                    {guardianLinksMode === 'guardian' ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input
                          value={athleteLinkEmail}
                          onChange={(event) => setAthleteLinkEmail(event.target.value)}
                          placeholder="athlete email"
                          className="min-w-0 flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] sm:min-w-[220px]"
                        />
                        <button
                          type="button"
                          onClick={handleLinkAthlete}
                          disabled={guardianLinkSaving}
                          className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {guardianLinkSaving ? 'Linking...' : 'Link athlete'}
                        </button>
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-2 text-sm">
                      {guardianLinksLoading ? (
                        <p className="text-xs text-[#4a4a4a]">Loading links...</p>
                      ) : guardianLinks.length === 0 && pendingGuardianInvites.length === 0 ? (
                        <p className="text-xs text-[#4a4a4a]">
                          {guardianLinksMode === 'guardian'
                            ? 'No linked athletes yet.'
                            : 'No guardian account linked yet. Saving guardian info stores the contact details, but this list only fills after the guardian accepts the invite or already has a guardian account.'}
                        </p>
                      ) : (
                        <>
                          {guardianLinks.map((link) => (
                            <div
                              key={link.id}
                              className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#4a4a4a]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-[#191919]">
                                    {link.related_profile?.full_name || 'Unnamed profile'}
                                  </p>
                                  <p>{link.related_profile?.email || 'Email not listed'}</p>
                                  <p className="mt-1 uppercase tracking-[0.2em] text-[#6b5f55]">{link.relationship || 'parent'}</p>
                                </div>
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-700">
                                  Linked
                                </span>
                              </div>
                              {guardianLinksMode !== 'guardian' ? (
                                <div className="mt-2 flex justify-end">
                                  <button
                                    type="button"
                                    disabled={deletingGuardianItemId === link.id}
                                    onClick={() =>
                                      handleDeleteGuardianItem({
                                        linkId: link.id,
                                        successMessage: 'Linked guardian removed.',
                                      })
                                    }
                                    className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-50"
                                  >
                                    {deletingGuardianItemId === link.id ? 'Removing...' : 'Remove guardian'}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                          {guardianLinksMode !== 'guardian' &&
                            pendingGuardianInvites.map((invite) => (
                              <div
                                key={invite.id}
                                className="rounded-2xl border border-amber-200 bg-[#fffaf2] px-3 py-2 text-xs text-[#4a4a4a]"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-[#191919]">{invite.guardian_email || 'Guardian email pending'}</p>
                                    <p className="mt-1">
                                      Invite sent {formatShortDateTime(invite.created_at) || 'recently'}.
                                      {invite.expires_at ? ` Expires ${formatShortDateTime(invite.expires_at)}.` : ''}
                                    </p>
                                    <p className="mt-1 text-[#6b5f55]">
                                      The guardian will appear here after accepting the email invite.
                                    </p>
                                  </div>
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-700">
                                    Invite pending
                                  </span>
                                </div>
                                <div className="mt-2 flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={resendingInviteId === invite.id}
                                    onClick={async () => {
                                      setResendingInviteId(invite.id)
                                      setGuardianLinkNotice('')
                                      const res = await fetch('/api/guardian-invites/request', { method: 'POST' })
                                      const payload = await res.json().catch(() => ({}))
                                      await loadGuardianLinks()
                                      setResendingInviteId(null)
                                      setGuardianLinkNotice(res.ok ? 'Invite resent.' : (payload?.error || 'Unable to resend invite.'))
                                    }}
                                    className="rounded-full border border-amber-300 px-3 py-1 font-semibold text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
                                  >
                                    {resendingInviteId === invite.id ? 'Sending...' : 'Resend invite'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deletingGuardianItemId === invite.id}
                                    onClick={() =>
                                      handleDeleteGuardianItem({
                                        inviteId: invite.id,
                                        successMessage: 'Guardian request deleted.',
                                      })
                                    }
                                    className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-50"
                                  >
                                    {deletingGuardianItemId === invite.id ? 'Deleting...' : 'Delete request'}
                                  </button>
                                </div>
                              </div>
                            ))}
                        </>
                      )}
                    </div>
                    {guardianLinkNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{guardianLinkNotice}</p> : null}
                  </div>
                </div>
                <div className="border-t border-[#dcdcdc] pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Emergency contacts</p>
                    {showEmergencyCards ? (
                      <button
                        type="button"
                        onClick={() => setShowEmergencyCards(false)}
                        className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        Edit contacts
                      </button>
                    ) : null}
                  </div>
                  {showEmergencyCards ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {emergencyContacts.map((contact, index) => (
                        <div
                          key={`emergency-card-${index}`}
                          className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 text-sm"
                        >
                          <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Contact {index + 1}</p>
                          <p className="mt-2 font-semibold text-[#191919]">{contact.name || 'Name not set'}</p>
                          <p className="text-xs text-[#4a4a4a]">{contact.relationship || 'Relationship not set'}</p>
                          <div className="mt-3 space-y-1 text-xs text-[#4a4a4a]">
                            <p>Email: {contact.email || 'Not provided'}</p>
                            <p>Phone: {contact.phone || 'Not provided'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-4">
                      {emergencyContacts.map((contact, index) => (
                        <div key={`emergency-${index}`} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Contact {index + 1}</p>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-[#191919]">Name</span>
                              <input
                                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                                value={contact.name}
                                onChange={(event) => {
                                  const next = [...emergencyContacts]
                                  next[index] = { ...next[index], name: event.target.value }
                                  setEmergencyContacts(next)
                                }}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-[#191919]">Relationship</span>
                              <input
                                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                                value={contact.relationship}
                                onChange={(event) => {
                                  const next = [...emergencyContacts]
                                  next[index] = { ...next[index], relationship: event.target.value }
                                  setEmergencyContacts(next)
                                }}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-[#191919]">Email</span>
                              <input
                                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                                value={contact.email}
                                onChange={(event) => {
                                  const next = [...emergencyContacts]
                                  next[index] = { ...next[index], email: event.target.value }
                                  setEmergencyContacts(next)
                                }}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-[#191919]">Phone</span>
                              <input
                                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                                value={contact.phone}
                                onChange={(event) => {
                                  const next = [...emergencyContacts]
                                  next[index] = { ...next[index], phone: event.target.value }
                                  setEmergencyContacts(next)
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {emergencyNotice && (
                    <p className="mt-3 text-xs text-[#4a4a4a]">{emergencyNotice}</p>
                  )}
                </div>
              </div>
            </section>
            <section id="payments" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Payments</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Payment methods and billing access.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setManagePlanModalOpen(true)}
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Manage plans
                </button>
              </div>
              <div className="mt-4 text-sm">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Payment method</p>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    Your saved card and billing schedule are already managed securely by Stripe.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenCustomerPortal}
                    className="mt-3 rounded-full border border-[#191919] px-4 py-1.5 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    Manage card
                  </button>
                </div>
              </div>
            </section>

            <section id="security" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Account & security</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Login, verification, and devices.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSaveSecurity}
                    disabled={securitySaving || passwordMismatch}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {securitySaving ? 'Saving...' : 'Save security'}
                  </button>
                  {savedFlags.security && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Saved
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold text-[#191919]">Email</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="athlete@example.com"
                    value={securityEmail}
                    onChange={(event) => setSecurityEmail(event.target.value)}
                  />
                  <p className="text-[11px] text-[#4a4a4a]">
                    Changing this email sends a confirmation link before the new address becomes active.
                  </p>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Change password</span>
                  <input
                    type="password"
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Confirm password</span>
                  <input
                    type="password"
                    className={`w-full rounded-2xl border bg-white px-3 py-2 text-sm text-[#191919] focus:outline-none ${
                      passwordMismatch ? 'border-[#b80f0a] focus:border-[#b80f0a]' : 'border-[#dcdcdc] focus:border-[#191919]'
                    }`}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    aria-invalid={passwordMismatch}
                  />
                  {passwordMismatch && (
                    <p className="text-[11px] text-[#b80f0a]">Passwords do not match.</p>
                  )}
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Two-factor authentication</span>
                  <select
                    value={twoFactorMethod}
                    onChange={(event) => setTwoFactorMethod(event.target.value as 'off' | 'authenticator')}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  >
                    <option value="off">Off</option>
                    <option value="authenticator">Authenticator app</option>
                  </select>
                </label>
                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-3 text-xs text-[#4a4a4a]">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Security status</p>
                  <p className="mt-2 text-sm font-semibold text-[#191919]">
                    MFA {twoFactorMethod === 'authenticator' ? 'Enabled' : 'Off'}
                  </p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">
                    Last login {lastSignInAt ? formatShortDateTime(lastSignInAt) : '—'}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Sessions</p>
                  <button
                    type="button"
                    onClick={handleSignOutOthers}
                    className="text-xs font-semibold text-[#b80f0a] underline"
                  >
                    Sign out other sessions
                  </button>
                </div>
                <p className="mt-2 text-xs text-[#4a4a4a]">Signs out all other active sessions immediately.</p>
              </div>
              {securityNotice && <p className="mt-3 text-xs text-[#4a4a4a]">{securityNotice}</p>}
            </section>

            <section id="notifications" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Notifications</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Choose how you stay updated.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveNotifications}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                    disabled={notificationSaving}
                  >
                    {notificationSaving ? 'Saving...' : 'Save notifications'}
                  </button>
                  {savedFlags.notifications && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Saved
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => applyNotificationPreset('minimal')}
                  className="rounded-full border border-[#191919] px-3 py-1 text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Minimal
                </button>
                <button
                  type="button"
                  onClick={() => applyNotificationPreset('standard')}
                  className="rounded-full border border-[#191919] px-3 py-1 text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => applyNotificationPreset('all')}
                  className="rounded-full border border-[#191919] px-3 py-1 text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  All
                </button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {notificationCategories.map((label) => {
                  const key = toCategoryKey(label)
                  const prefs = notificationPrefs[key]
                  return (
                    <div key={label} className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-sm">
                      <p className="font-semibold text-[#191919]">{label}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#191919]">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 border-[#191919] text-[#b80f0a]"
                            checked={prefs?.email ?? true}
                            onChange={(event) =>
                              setNotificationPrefs((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], email: event.target.checked },
                              }))
                            }
                          />
                          <span>Email</span>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
              {notificationNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{notificationNotice}</p> : null}
            </section>

            <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Advanced settings</p>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Privacy, communication, and data controls.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  {showAdvanced ? 'Hide advanced' : 'Show advanced'}
                </button>
              </div>
            </div>

            {showAdvanced && (
              <>
                <section id="integrations" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#191919]">Integrations</h3>
                      <p className="mt-1 text-sm text-[#4a4a4a]">Connect calendars and video tools.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveIntegrations}
                      className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                      disabled={integrationSaving}
                    >
                      {integrationSaving ? 'Saving...' : 'Save integrations'}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#191919]">Google Calendar + Meet</p>
                          <p className="mt-1 text-xs text-[#4a4a4a]">Sync sessions and auto-create Meet links.</p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                            integrationSettings.connections.google.connected
                              ? 'border-[#b80f0a] bg-white text-[#b80f0a]'
                              : 'border-[#191919] text-[#191919]'
                          }`}
                        >
                          {integrationSettings.connections.google.connected ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            integrationSettings.connections.google.connected
                              ? handleDisconnectProvider('google')
                              : handleConnectProvider('google')
                          }
                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                          disabled={integrationConnecting.google}
                        >
                          {integrationConnecting.google
                            ? 'Working...'
                            : integrationSettings.connections.google.connected
                              ? 'Disconnect'
                              : 'Connect'}
                        </button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#191919]">Zoom</p>
                          <p className="mt-1 text-xs text-[#4a4a4a]">Generate Zoom links for sessions.</p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                            integrationSettings.connections.zoom.connected
                              ? 'border-[#b80f0a] bg-white text-[#b80f0a]'
                              : 'border-[#191919] text-[#191919]'
                          }`}
                        >
                          {integrationSettings.connections.zoom.connected ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            integrationSettings.connections.zoom.connected
                              ? handleDisconnectProvider('zoom')
                              : handleConnectProvider('zoom')
                          }
                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                          disabled={integrationConnecting.zoom}
                        >
                          {integrationConnecting.zoom
                            ? 'Working...'
                            : integrationSettings.connections.zoom.connected
                              ? 'Disconnect'
                              : 'Connect'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-sm text-[#191919]">
                      <span>Calendar sync</span>
                      <select
                        value={integrationSettings.calendarProvider}
                        onChange={(event) =>
                          setIntegrationSettings((prev) => ({
                            ...prev,
                            calendarProvider: event.target.value as IntegrationSettings['calendarProvider'],
                          }))
                        }
                        className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="none">None</option>
                        <option value="google">Google Calendar</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-[#191919]">
                      <span>Default video link</span>
                      <select
                        value={integrationSettings.videoProvider}
                        onChange={(event) =>
                          setIntegrationSettings((prev) => ({
                            ...prev,
                            videoProvider: event.target.value as IntegrationSettings['videoProvider'],
                          }))
                        }
                        className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="zoom">Zoom</option>
                        <option value="google_meet">Google Meet</option>
                        <option value="custom">Custom link</option>
                      </select>
                    </label>
                    {integrationSettings.videoProvider === 'custom' ? (
                      <label className="space-y-2 text-sm text-[#191919] md:col-span-2">
                        <span>Custom video link</span>
                        <input
                          className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                          placeholder="https://..."
                          value={integrationSettings.customVideoLink}
                          onChange={(event) =>
                            setIntegrationSettings((prev) => ({ ...prev, customVideoLink: event.target.value }))
                          }
                        />
                      </label>
                    ) : null}
                  </div>
                  {integrationNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{integrationNotice}</p> : null}
                </section>

                <section id="privacy" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#191919]">Privacy & safety</h3>
                      <p className="mt-1 text-sm text-[#4a4a4a]">Control coach messaging access and blocked contacts.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSavePrivacy}
                        disabled={privacySaving}
                        className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                      >
                        {privacySaving ? 'Saving...' : 'Save privacy'}
                      </button>
                      {savedFlags.privacy && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Saved
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 border-[#191919] text-[#b80f0a]"
                        checked={privacySettings.allowDirectMessages}
                        onChange={(event) =>
                          setPrivacySettings((prev) => ({ ...prev, allowDirectMessages: event.target.checked }))
                        }
                      />
                      <span>
                        Allow coaches to message you directly
                        <p className="text-xs text-[#4a4a4a]">Adjust this preference anytime.</p>
                      </span>
                    </label>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#191919]">Blocked coaches</span>
                      <textarea
                        className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        rows={3}
                        placeholder="List coaches or emails to block"
                        value={privacySettings.blockedCoaches}
                        onChange={(event) =>
                          setPrivacySettings((prev) => ({ ...prev, blockedCoaches: event.target.value }))
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#191919]">Guardian contact</span>
                      <input
                        className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        placeholder="Parent/guardian email"
                        value={guardianEmail}
                        onChange={(event) => setGuardianEmail(event.target.value)}
                      />
                    </label>
                  </div>
                  {privacyNotice && <p className="mt-2 text-xs text-[#4a4a4a]">{privacyNotice}</p>}
                </section>

                <section id="communication" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#191919]">Communication preferences</h3>
                      <p className="mt-1 text-sm text-[#4a4a4a]">Choose your email notification defaults.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveCommunication}
                        disabled={communicationSaving}
                        className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                      >
                        {communicationSaving ? 'Saving...' : 'Save communication'}
                      </button>
                      {savedFlags.communication && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Saved
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#191919]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 border-[#191919] text-[#b80f0a]"
                        checked={communicationSettings.email}
                        onChange={(event) =>
                          setCommunicationSettings((prev) => ({ ...prev, email: event.target.checked }))
                        }
                      />
                      <span>Email updates</span>
                    </label>
                  </div>
                  {communicationNotice && <p className="mt-2 text-xs text-[#4a4a4a]">{communicationNotice}</p>}
                </section>

                <section id="connections" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#191919]">Linked accounts</h3>
                      <p className="mt-1 text-sm text-[#4a4a4a]">Connected sign-in providers.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenConnections}
                      className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Manage connections
                    </button>
                  </div>
                  {connectionsNotice && <p className="mt-2 text-xs text-[#4a4a4a]">{connectionsNotice}</p>}
                  <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
                    {connectionsLoading ? (
                      <LoadingState label="Loading connections..." />
                    ) : connectedIdentities.length === 0 ? (
                      <div className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                        No connected providers yet.
                      </div>
                    ) : (
                      connectedIdentities.map((identity) => (
                        <div key={identity.id} className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3">
                          <p className="font-semibold text-[#191919]">
                            {identity.provider.charAt(0).toUpperCase() + identity.provider.slice(1)}
                          </p>
                          <p className="text-xs text-[#4a4a4a]">{identity.email || 'Connected'}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section id="export-center" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#191919]">Export center</h3>
                      <p className="mt-1 text-sm text-[#4a4a4a]">Download profile, sessions, payments, marketplace orders, and performance exports.</p>
                    </div>
                    <Link
                      href="/athlete/support"
                      className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Contact support
                    </Link>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <ExportButtons endpoint="/api/athlete/exports?type=profile" filenamePrefix="athlete-profile" label="Profile & contacts" />
                    <ExportButtons endpoint="/api/athlete/exports?type=sessions" filenamePrefix="athlete-sessions" label="Sessions" showDateRange />
                    <ExportButtons endpoint="/api/athlete/exports?type=payments" filenamePrefix="athlete-payments" label="Payments" showDateRange />
                    <ExportButtons endpoint="/api/athlete/exports?type=orders" filenamePrefix="athlete-orders" label="Marketplace orders" showDateRange />
                    <ExportButtons endpoint="/api/athlete/exports?type=metrics" filenamePrefix="athlete-performance" label="Performance metrics" />
                  </div>
                </section>
              </>
            )}
            <section id="account" className="glass-card scroll-mt-24 border border-[#b80f0a] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Account controls</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Cancel billing or permanently delete your profile.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCancelSubscriptionModalOpen(true)}
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Cancel subscription
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteAccountModalOpen(true)}
                  className="rounded-full border border-[#b80f0a] px-4 py-2 text-sm font-semibold text-[#b80f0a] hover:bg-[#b80f0a] hover:text-white transition-colors"
                >
                  Delete profile
                </button>
              </div>
              {accountNotice && <p className="mt-2 text-xs text-[#4a4a4a]">{accountNotice}</p>}
            </section>
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-[#e5e5e5] bg-white p-4 text-xs">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#4a4a4a]">Jump to</p>
              <nav className="mt-3 space-y-2 text-xs font-semibold text-[#191919]">
                <a href="#profile" className="block hover:text-[#b80f0a]">Profile</a>
                <a href="#profiles" className="block hover:text-[#b80f0a]">Athletes</a>
                <a href="#family" className="block hover:text-[#b80f0a]">Family & safety</a>
                <a href="#payments" className="block hover:text-[#b80f0a]">Payments</a>
                <a href="#notifications" className="block hover:text-[#b80f0a]">Notifications</a>
                <a href="#security" className="block hover:text-[#b80f0a]">Security</a>
                {showAdvanced ? (
                  <>
                    <a href="#integrations" className="block hover:text-[#b80f0a]">Integrations</a>
                    <a href="#privacy" className="block hover:text-[#b80f0a]">Privacy</a>
                    <a href="#communication" className="block hover:text-[#b80f0a]">Communication</a>
                    <a href="#connections" className="block hover:text-[#b80f0a]">Connections</a>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(true)}
                    className="w-full text-left text-xs font-semibold text-[#b80f0a] underline"
                  >
                    Show advanced
                  </button>
                )}
                {showAdvanced ? <a href="#export-center" className="block hover:text-[#b80f0a]">Export center</a> : null}
                <a href="#account" className="block hover:text-[#b80f0a]">Account controls</a>
              </nav>
            </div>
          </aside>
        </div>
      </div>
      <ManagePlanModal
        open={managePlanModalOpen}
        onClose={() => setManagePlanModalOpen(false)}
        role="athlete"
        currentTier={athleteTier}
        isSubscribed={Boolean(athleteTier)}
        onPlanChanged={(tier) => setAthleteTier(tier as 'explore' | 'train' | 'family')}
      />
      <Toast message={toast} onClose={() => setToast('')} />
      {cancelSubscriptionModalOpen && (
        <div className="fixed inset-0 z-[325] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Subscription</p>
                <h2 className="text-lg font-semibold text-[#191919]">Cancel your subscription?</h2>
              </div>
              <button
                type="button"
                onClick={() => setCancelSubscriptionModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-3 text-xs text-[#4a4a4a]">
              This immediately blocks feature access and sends you to your dashboard.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={accountActionLoading === 'cancel'}
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {accountActionLoading === 'cancel' ? 'Canceling...' : 'Confirm cancellation'}
              </button>
              <button
                type="button"
                onClick={() => setCancelSubscriptionModalOpen(false)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Keep subscription
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteAccountModalOpen && (
        <div className="fixed inset-0 z-[325] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Account</p>
                <h2 className="text-lg font-semibold text-[#191919]">Delete your profile?</h2>
              </div>
              <button
                type="button"
                onClick={() => setDeleteAccountModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-3 text-xs text-[#4a4a4a]">
              This permanently deletes your account, logs you out immediately, and returns you to the public home page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={accountActionLoading === 'delete'}
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {accountActionLoading === 'delete' ? 'Deleting...' : 'Confirm delete'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteAccountModalOpen(false)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Keep account
              </button>
            </div>
          </div>
        </div>
      )}
      {mfaModalOpen && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Two-factor</p>
                <h2 className="text-lg font-semibold text-[#191919]">Set up authenticator app</h2>
              </div>
              <button
                type="button"
                onClick={handleCancelMfa}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
              <div className="space-y-3 text-xs text-[#4a4a4a]">
                <p>
                  Scan the QR code with your authenticator app, then enter the 6-digit code to finish setup.
                </p>
                {mfaSecret && (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Manual key</p>
                    <p className="mt-1 break-all font-semibold text-[#191919]">{mfaSecret}</p>
                  </div>
                )}
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Verification code</span>
                  <input
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="123456"
                  />
                </label>
                {mfaNotice && <p className="text-xs text-[#b80f0a]">{mfaNotice}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleVerifyMfa}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    Verify & enable
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelMfa}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center rounded-2xl border border-[#dcdcdc] bg-white p-4">
                {mfaQr ? (
                  <Image
                    src={mfaQr.startsWith('data:') ? mfaQr : `data:image/svg+xml;utf8,${encodeURIComponent(mfaQr)}`}
                    alt="Authenticator QR code"
                    width={160}
                    height={160}
                    unoptimized
                    className="h-40 w-40"
                  />
                ) : (
                  <span className="text-xs text-[#4a4a4a]">QR code unavailable</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {connectionsModalOpen && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Connections</p>
                <h2 className="text-lg font-semibold text-[#191919]">Linked sign-in providers</h2>
              </div>
              <button
                type="button"
                onClick={() => setConnectionsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-2 text-xs text-[#4a4a4a]">
              Keep at least one sign-in method connected to avoid lockouts.
            </p>
            <div className="mt-4 space-y-3">
              {connectionsLoading ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs text-[#4a4a4a]">
                  Loading connections...
                </div>
              ) : connectedIdentities.length === 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs text-[#4a4a4a]">
                  No connected providers found.
                </div>
              ) : (
                connectedIdentities.map((identity) => (
                  <div
                    key={identity.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-[#191919]">
                        {identity.provider.charAt(0).toUpperCase() + identity.provider.slice(1)}
                      </p>
                      {identity.email ? (
                        <p className="text-xs text-[#4a4a4a]">{identity.email}</p>
                      ) : null}
                      {identity.created_at ? (
                        <p className="text-[11px] text-[#8a8a8a]">Connected {formatShortDateTime(identity.created_at)}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDisconnectIdentity(identity.id)}
                      disabled={connectedIdentities.length <= 1 || connectionsLoading}
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </div>
                ))
              )}
            </div>
            {connectionsNotice && <p className="mt-3 text-xs text-[#b80f0a]">{connectionsNotice}</p>}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setConnectionsModalOpen(false)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddProfileModal && (
        <div className="fixed inset-0 z-[325] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Profiles</p>
                <h2 className="text-lg font-semibold text-[#191919]">Add athlete profile</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddProfileModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#191919]">Athlete name</span>
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#191919]">Sport</span>
                <input
                  type="text"
                  value={newProfileSport}
                  onChange={(e) => setNewProfileSport(e.target.value)}
                  placeholder="e.g. Soccer, Basketball"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAddProfile}
                disabled={addProfileLoading || !newProfileName.trim()}
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {addProfileLoading ? 'Adding...' : 'Add profile'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddProfileModal(false)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
