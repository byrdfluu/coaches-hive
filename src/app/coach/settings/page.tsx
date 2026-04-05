'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ChangeEvent } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import RoleSwitcher from '@/components/RoleSwitcher'
import CoachSidebar from '@/components/CoachSidebar'
import Toast from '@/components/Toast'
import ExportButtons from '@/components/ExportButtons'
import ManagePlanModal from '@/components/ManagePlanModal'
import MobileSectionJumpNav from '@/components/MobileSectionJumpNav'
import { getFeePercentage, type FeeTier } from '@/lib/platformFees'
import { addDays, formatShortDate } from '@/lib/dateUtils'
import { getCoachPayoutAnchorLabel, getCoachPayoutCadenceLabel } from '@/lib/coachPayoutRules'
import {
  buildNotificationPrefs,
  mergeNotificationPrefs,
  toCategoryKey,
  type NotificationPrefs,
} from '@/lib/notificationPrefs'

type IntegrationSettings = {
  calendarProvider: 'none' | 'google' | 'apple'
  videoProvider: 'zoom' | 'google_meet' | 'custom'
  customVideoLink: string
  webhookUrl: string
  connections: {
    google: { connected: boolean; connected_at?: string }
    zoom: { connected: boolean; connected_at?: string }
    apple: { subscribed: boolean; subscribed_at?: string }
  }
}

type CoachPrivacySettings = {
  visibleToAthletes: boolean
  allowDirectMessages: boolean
  showProgressSnapshots: boolean
  showRatings: boolean
  blockedAthletes: string
  regionVisibility: string
}

type CoachProfileMedia = {
  id: string
  url: string
  name: string
  type: string
  size: number
  uploaded_at: string
}

type CoachProfileSettings = {
  title: string
  location: string
  primarySport: string
  yearsExperience: string
  coachLevels: string[]
  sessionFormats: string
  responseTime: string
  rates: {
    oneOnOne: string
    team: string
    group: string
    virtual: string
    assessment: string
  }
  certification: {
    name: string
    organization: string
    date: string
    fileUrl?: string
  }
  media: CoachProfileMedia[]
}

type CoachPasskey = {
  id: string
  label: string
  created_at: string
}

type CoachSecuritySettings = {
  twoFactorMethod: 'off' | 'authenticator'
  passkeys?: CoachPasskey[]
}

type CoachVerificationState = 'not_submitted' | 'in_review' | 'verified'

const defaultPrivacySettings: CoachPrivacySettings = {
  visibleToAthletes: true,
  allowDirectMessages: true,
  showProgressSnapshots: true,
  showRatings: true,
  blockedAthletes: '',
  regionVisibility: '',
}

const defaultProfileSettings: CoachProfileSettings = {
  title: '',
  location: '',
  primarySport: '',
  yearsExperience: '',
  coachLevels: [],
  sessionFormats: '',
  responseTime: '',
  rates: {
    oneOnOne: '',
    team: '',
    group: '',
    virtual: '',
    assessment: '',
  },
  certification: {
    name: '',
    organization: '',
    date: '',
  },
  media: [],
}

const defaultSecuritySettings: CoachSecuritySettings = {
  twoFactorMethod: 'off',
}

const normalizeVerificationStatus = (value: string | null | undefined): CoachVerificationState => {
  const normalized = String(value || '').trim().toLowerCase()
  if (['approved', 'verified'].includes(normalized)) return 'verified'
  if (['pending', 'needs_review', 'in_review', 'under_review'].includes(normalized)) return 'in_review'
  return 'not_submitted'
}

const defaultIntegrationSettings: IntegrationSettings = {
  calendarProvider: 'none',
  videoProvider: 'zoom',
  customVideoLink: '',
  webhookUrl: '',
  connections: {
    google: { connected: false },
    zoom: { connected: false },
    apple: { subscribed: false },
  },
}

export default function CoachSettingsPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [payoutSaving, setPayoutSaving] = useState(false)
  const [payoutNotice, setPayoutNotice] = useState('')
  const [coachSeasonsInput, setCoachSeasonsInput] = useState('')
  const [coachGradesInput, setCoachGradesInput] = useState('')
  const [profileNotice, setProfileNotice] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [profileTitle, setProfileTitle] = useState('')
  const [profileLocation, setProfileLocation] = useState('')
  const [profileSport, setProfileSport] = useState('')
  const [profileBio, setProfileBio] = useState('')
  const [profileMedia, setProfileMedia] = useState<CoachProfileMedia[]>([])
  const [profileMediaUploading, setProfileMediaUploading] = useState(false)
  const [certName, setCertName] = useState('')
  const [certOrg, setCertOrg] = useState('')
  const [certDate, setCertDate] = useState('')
  const [certFileUrl, setCertFileUrl] = useState('')
  const [certFileUploading, setCertFileUploading] = useState(false)
  const [rateOneOnOne, setRateOneOnOne] = useState('')
  const [rateTeam, setRateTeam] = useState('')
  const [rateGroup, setRateGroup] = useState('')
  const [rateVirtual, setRateVirtual] = useState('')
  const [rateAssessment, setRateAssessment] = useState('')
  const [yearsExperience, setYearsExperience] = useState('')
  const [coachLevelsInput, setCoachLevelsInput] = useState<string[]>([])
  const [sessionFormats, setSessionFormats] = useState('')
  const [responseTime, setResponseTime] = useState('')
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string>(() =>
    typeof window !== 'undefined'
      ? (window.localStorage.getItem('ch_avatar_url') || '/avatar-coach-placeholder.png')
      : '/avatar-coach-placeholder.png'
  )
  const [avatarUploading, setAvatarUploading] = useState(false)
  const showUploadHint = avatarUrl.includes('placeholder')
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [brandCoverUrl, setBrandCoverUrl] = useState('')
  const [brandPrimaryColor, setBrandPrimaryColor] = useState('#191919')
  const [brandAccentColor, setBrandAccentColor] = useState('#b80f0a')
  const [brandingNotice, setBrandingNotice] = useState('')
  const [brandingSaving, setBrandingSaving] = useState(false)
  const [brandingUploading, setBrandingUploading] = useState(false)
  const [policyCancelWindow, setPolicyCancelWindow] = useState('24 hours')
  const [policyRescheduleWindow, setPolicyRescheduleWindow] = useState('Up to 24 hours')
  const [policyRefundText, setPolicyRefundText] = useState('')
  const [policySaving, setPolicySaving] = useState(false)
  const [policyNotice, setPolicyNotice] = useState('')
  const [commHours, setCommHours] = useState('')
  const [commAutoReply, setCommAutoReply] = useState('')
  const [commSilenceOutside, setCommSilenceOutside] = useState(false)
  const [commSaving, setCommSaving] = useState(false)
  const [commNotice, setCommNotice] = useState('')
  const notificationCategories = useMemo(
    () => ['Sessions', 'Payments', 'Reviews', 'Marketplace'],
    [],
  )
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(
    () => buildNotificationPrefs(notificationCategories)
  )
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationNotice, setNotificationNotice] = useState('')
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(defaultIntegrationSettings)
  const [integrationSaving, setIntegrationSaving] = useState(false)
  const [integrationNotice, setIntegrationNotice] = useState('')
  const [integrationConnecting, setIntegrationConnecting] = useState<Record<string, boolean>>({})
  const [calendarFeedToken, setCalendarFeedToken] = useState('')
  const [calendarFeedUrl, setCalendarFeedUrl] = useState('')
  const [privacySettings, setPrivacySettings] = useState<CoachPrivacySettings>(defaultPrivacySettings)
  const [privacySaving, setPrivacySaving] = useState(false)
  const [privacyNotice, setPrivacyNotice] = useState('')
  const [securityEmail, setSecurityEmail] = useState('')
  const [originalSecurityEmail, setOriginalSecurityEmail] = useState('')
  const [securityPhone, setSecurityPhone] = useState('')
  const [securityPassword, setSecurityPassword] = useState('')
  const [securityMethod, setSecurityMethod] = useState<CoachSecuritySettings['twoFactorMethod']>('off')
  const [passkeys, setPasskeys] = useState<CoachPasskey[]>([])
  const [passkeyModalOpen, setPasskeyModalOpen] = useState(false)
  const [passkeyName, setPasskeyName] = useState('')
  const [passkeyNotice, setPasskeyNotice] = useState('')
  const [passkeySaving, setPasskeySaving] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false)
  const [recoveryNotice, setRecoveryNotice] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null)
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null)
  const [mfaQr, setMfaQr] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaNotice, setMfaNotice] = useState('')
  const [mfaModalOpen, setMfaModalOpen] = useState(false)
  const [securitySaving, setSecuritySaving] = useState(false)
  const [securityNotice, setSecurityNotice] = useState('')
  const [stripeLoginLoading, setStripeLoginLoading] = useState(false)
  const [stripeConnectLoading, setStripeConnectLoading] = useState(false)
  const [stripeAccountId, setStripeAccountId] = useState('')
  const [verificationStatus, setVerificationStatus] = useState<CoachVerificationState>('not_submitted')
  const [toast, setToast] = useState('')
  const [accountNotice, setAccountNotice] = useState('')
  const [cancelSubscriptionModalOpen, setCancelSubscriptionModalOpen] = useState(false)
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false)
  const [managePlanModalOpen, setManagePlanModalOpen] = useState(false)
  const [accountActionLoading, setAccountActionLoading] = useState<'cancel' | 'delete' | null>(null)
  const [idDocument, setIdDocument] = useState<File | null>(null)
  const [certDocuments, setCertDocuments] = useState<FileList | null>(null)
  const [coachTier, setCoachTier] = useState<FeeTier>('starter')
  const [coachPlanCreatedAt, setCoachPlanCreatedAt] = useState<string | null>(null)
  const [feeRules, setFeeRules] = useState<Array<{ tier: string; category: string; percentage: number }>>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [savedFlags, setSavedFlags] = useState({
    profile: false,
    verification: false,
    security: false,
    branding: false,
    policies: false,
    communication: false,
    notifications: false,
    payouts: false,
    integrations: false,
    privacy: false,
  })
  const [billingInfo, setBillingInfo] = useState<{
    status: string | null
    current_period_end: string | null
    trial_end: string | null
    cancel_at_period_end: boolean
  } | null>(null)
  const renewalDate = billingInfo?.current_period_end
    ? formatShortDate(new Date(billingInfo.current_period_end))
    : billingInfo?.trial_end
      ? formatShortDate(new Date(billingInfo.trial_end))
      : formatShortDate(addDays(new Date(), 30))
  const payoutCadenceLabel = useMemo(() => getCoachPayoutCadenceLabel(coachTier), [coachTier])
  const payoutAnchorLabel = useMemo(
    () => getCoachPayoutAnchorLabel({ tier: coachTier, anchorDate: coachPlanCreatedAt }),
    [coachTier, coachPlanCreatedAt],
  )

  const triggerSaved = useCallback((key: keyof typeof savedFlags) => {
    setSavedFlags((prev) => ({ ...prev, [key]: true }))
    window.setTimeout(() => {
      setSavedFlags((prev) => ({ ...prev, [key]: false }))
    }, 2000)
  }, [])

  const broadcastCoachProfileUpdate = useCallback((detail?: { name?: string; avatarUrl?: string }) => {
    if (typeof window === 'undefined') return
    const updatedAt = new Date().toISOString()
    window.localStorage.setItem('ch_coach_profile_updated_at', updatedAt)
    if (detail?.name) {
      window.localStorage.setItem('ch_full_name', detail.name)
      window.dispatchEvent(new CustomEvent('ch:name-updated', { detail: { name: detail.name } }))
    }
    if (detail?.avatarUrl) {
      window.localStorage.setItem('ch_avatar_url', detail.avatarUrl)
      window.dispatchEvent(new CustomEvent('ch:avatar-updated', { detail: { url: detail.avatarUrl } }))
    }
    window.dispatchEvent(new CustomEvent('ch:coach-profile-updated', { detail: { updatedAt } }))
  }, [])

  const loadProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) return
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, bio, certifications, coach_profile_settings, coach_security_settings, avatar_url, brand_logo_url, brand_cover_url, brand_primary_color, brand_accent_color, coach_seasons, coach_grades, coach_cancel_window, coach_reschedule_window, coach_refund_policy, coach_messaging_hours, coach_auto_reply, coach_silence_outside_hours, notification_prefs, integration_settings, calendar_feed_token, coach_privacy_settings, stripe_account_id, verification_status')
      .eq('id', userId)
      .maybeSingle()
    const profileRow = (profile || null) as {
      full_name?: string | null
      bio?: string | null
      certifications?: string | null
      coach_profile_settings?: Record<string, unknown> | null
      coach_security_settings?: Record<string, unknown> | null
      avatar_url?: string | null
      brand_logo_url?: string | null
      brand_cover_url?: string | null
      brand_primary_color?: string | null
      brand_accent_color?: string | null
      coach_seasons?: string[] | null
      coach_grades?: string[] | null
      coach_cancel_window?: string | null
      coach_reschedule_window?: string | null
      coach_refund_policy?: string | null
      coach_messaging_hours?: string | null
      coach_auto_reply?: string | null
      coach_silence_outside_hours?: boolean | null
      notification_prefs?: Record<string, unknown> | null
      integration_settings?: Record<string, unknown> | null
      calendar_feed_token?: string | null
      coach_privacy_settings?: Record<string, unknown> | null
      stripe_account_id?: string | null
      verification_status?: string | null
    } | null
    if (!profileRow) return
    setStripeAccountId(profileRow.stripe_account_id || '')
    setVerificationStatus(normalizeVerificationStatus(profileRow.verification_status))
    setAvatarUrl(profileRow.avatar_url || '/avatar-coach-placeholder.png')
    if (profileRow.avatar_url) {
      window.localStorage.setItem('ch_avatar_url', profileRow.avatar_url)
    }
    setFullName(profileRow.full_name || '')
    if (profileRow.full_name) {
      window.localStorage.setItem('ch_full_name', profileRow.full_name)
    }
    setProfileBio(profileRow.bio || '')
    setBrandLogoUrl(profileRow.brand_logo_url || '')
    setBrandCoverUrl(profileRow.brand_cover_url || '')
    setBrandPrimaryColor(profileRow.brand_primary_color || '#191919')
    setBrandAccentColor(profileRow.brand_accent_color || '#b80f0a')
    setCoachSeasonsInput(Array.isArray(profileRow.coach_seasons) ? profileRow.coach_seasons.join(', ') : '')
    setCoachGradesInput(Array.isArray(profileRow.coach_grades) ? profileRow.coach_grades.join(', ') : '')
    setPolicyCancelWindow(profileRow.coach_cancel_window || '24 hours')
    setPolicyRescheduleWindow(profileRow.coach_reschedule_window || 'Up to 24 hours')
    setPolicyRefundText(profileRow.coach_refund_policy || '')
    setCommHours(profileRow.coach_messaging_hours || '')
    setCommAutoReply(profileRow.coach_auto_reply || '')
    setCommSilenceOutside(Boolean(profileRow.coach_silence_outside_hours))
    if (profileRow.notification_prefs) {
      const defaults = buildNotificationPrefs(notificationCategories)
      setNotificationPrefs(mergeNotificationPrefs(defaults, profileRow.notification_prefs))
    } else {
      setNotificationPrefs(buildNotificationPrefs(notificationCategories))
    }
    if (profileRow.integration_settings && typeof profileRow.integration_settings === 'object') {
      const stored = profileRow.integration_settings as Partial<IntegrationSettings>
      setIntegrationSettings({
        ...defaultIntegrationSettings,
        ...stored,
        connections: {
          ...defaultIntegrationSettings.connections,
          ...(stored.connections || {}),
        },
      })
    }
    if (profileRow.coach_profile_settings && typeof profileRow.coach_profile_settings === 'object') {
      const stored = profileRow.coach_profile_settings as Partial<CoachProfileSettings>
      setProfileTitle(stored.title || defaultProfileSettings.title)
      setProfileLocation(stored.location || defaultProfileSettings.location)
      setProfileSport(stored.primarySport || defaultProfileSettings.primarySport)
      setRateOneOnOne(stored.rates?.oneOnOne ?? defaultProfileSettings.rates.oneOnOne)
      setRateTeam(stored.rates?.team ?? defaultProfileSettings.rates.team)
      setRateGroup(stored.rates?.group ?? defaultProfileSettings.rates.group)
      setRateVirtual(stored.rates?.virtual ?? defaultProfileSettings.rates.virtual)
      setRateAssessment(stored.rates?.assessment ?? defaultProfileSettings.rates.assessment)
      setCertName(stored.certification?.name ?? defaultProfileSettings.certification.name)
      setCertOrg(stored.certification?.organization ?? defaultProfileSettings.certification.organization)
      setCertDate(stored.certification?.date ?? defaultProfileSettings.certification.date)
      setCertFileUrl(stored.certification?.fileUrl ?? '')
      setProfileMedia(Array.isArray(stored.media) ? (stored.media as CoachProfileMedia[]) : [])
      setYearsExperience(stored.yearsExperience || '')
      setCoachLevelsInput(Array.isArray(stored.coachLevels) ? stored.coachLevels : [])
      setSessionFormats(stored.sessionFormats || '')
      setResponseTime(stored.responseTime || '')
    }
    if (profileRow.coach_privacy_settings && typeof profileRow.coach_privacy_settings === 'object') {
      const stored = profileRow.coach_privacy_settings as Partial<CoachPrivacySettings>
      setPrivacySettings({
        ...defaultPrivacySettings,
        ...stored,
      })
    }
    if (profileRow.coach_security_settings && typeof profileRow.coach_security_settings === 'object') {
      const stored = profileRow.coach_security_settings as Partial<CoachSecuritySettings>
      setSecurityMethod(stored.twoFactorMethod || defaultSecuritySettings.twoFactorMethod)
      if (Array.isArray(stored.passkeys)) {
        setPasskeys(stored.passkeys as CoachPasskey[])
      }
    }
    if (profileRow.calendar_feed_token) {
      setCalendarFeedToken(profileRow.calendar_feed_token)
    }
  }, [notificationCategories, supabase])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  useEffect(() => {
    const loadSecurityBasics = async () => {
      const { data } = await supabase.auth.getUser()
      if (data.user?.email) {
        setSecurityEmail(data.user.email)
        setOriginalSecurityEmail(data.user.email)
      }
      if (data.user?.phone) {
        setSecurityPhone(data.user.phone)
      }
    }
    loadSecurityBasics()
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadBillingInfo = async () => {
      const response = await fetch('/api/stripe/billing-info')
      if (!response.ok || !active) return
      const data = await response.json()
      if (!active) return
      setBillingInfo({
        status: data.status ?? null,
        current_period_end: data.current_period_end ?? null,
        trial_end: data.trial_end ?? null,
        cancel_at_period_end: Boolean(data.cancel_at_period_end),
      })
    }
    loadBillingInfo()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadMfa = async () => {
      const mfa = (supabase.auth as any).mfa
      if (!mfa?.listFactors) return
      const { data, error } = await mfa.listFactors()
      if (!active || error) return
      const verified = data?.totp?.[0] ?? null
      setVerifiedFactorId(verified?.id ?? null)
      setSecurityMethod(verified ? 'authenticator' : 'off')
    }
    loadMfa()
    return () => {
      active = false
    }
  }, [supabase])
  useEffect(() => {
    if (!calendarFeedToken || typeof window === 'undefined') return
    setCalendarFeedUrl(`${window.location.origin}/api/calendar/ical?token=${calendarFeedToken}`)
  }, [calendarFeedToken])


  useEffect(() => {
    let mounted = true
    const loadPlan = async () => {
      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (!userId) return

      const { data: planRow } = await supabase
        .from('coach_plans')
        .select('tier, created_at')
        .eq('coach_id', userId)
        .maybeSingle()

      const { data: feeRuleRows } = await supabase
        .from('platform_fee_rules')
        .select('tier, category, percentage')
        .eq('active', true)

      if (!mounted) return
      if (planRow?.tier) {
        setCoachTier(planRow.tier as FeeTier)
      }
      setCoachPlanCreatedAt(planRow?.created_at || null)
      setFeeRules((feeRuleRows || []) as Array<{ tier: string; category: string; percentage: number }>)
    }
    loadPlan()
    return () => {
      mounted = false
    }
  }, [supabase])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const syncAdvancedFromHash = () => {
      if (['#integrations', '#privacy', '#export-center'].includes(window.location.hash)) {
        setShowAdvanced(true)
      }
    }

    syncAdvancedFromHash()
    window.addEventListener('hashchange', syncAdvancedFromHash)
    return () => {
      window.removeEventListener('hashchange', syncAdvancedFromHash)
    }
  }, [])

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
      broadcastCoachProfileUpdate({ avatarUrl: data.url })
      await loadProfile()
    }
    setAvatarUploading(false)
    event.target.value = ''
  }, [broadcastCoachProfileUpdate, loadProfile])

  const handleBrandingUpload = useCallback(async (slot: 'logo' | 'cover', event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBrandingUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('scope', 'coach')
    formData.append('slot', slot)
    const response = await fetch('/api/storage/branding', {
      method: 'POST',
      body: formData,
    })
    if (response.ok) {
      const data = await response.json()
      if (slot === 'logo') {
        setBrandLogoUrl(data.url)
      } else {
        setBrandCoverUrl(data.url)
      }
    }
    setBrandingUploading(false)
    event.target.value = ''
  }, [])

  const buildProfileSettings = useCallback(
    (overrides?: Partial<CoachProfileSettings>) => ({
      title: profileTitle.trim(),
      location: profileLocation.trim(),
      primarySport: profileSport.trim(),
      yearsExperience: yearsExperience.trim(),
      coachLevels: coachLevelsInput,
      sessionFormats,
      responseTime,
      rates: {
        oneOnOne: rateOneOnOne,
        team: rateTeam,
        group: rateGroup,
        virtual: rateVirtual,
        assessment: rateAssessment,
      },
      certification: {
        name: certName.trim(),
        organization: certOrg.trim(),
        date: certDate,
        fileUrl: certFileUrl || '',
      },
      media: profileMedia,
      ...(overrides || {}),
    }),
    [
      profileTitle,
      profileLocation,
      profileSport,
      yearsExperience,
      coachLevelsInput,
      sessionFormats,
      responseTime,
      rateOneOnOne,
      rateTeam,
      rateGroup,
      rateVirtual,
      rateAssessment,
      certName,
      certOrg,
      certDate,
      certFileUrl,
      profileMedia,
    ]
  )

  const persistProfileSettings = useCallback(
    async (nextSettings: CoachProfileSettings, notice?: string) => {
      const response = await fetch('/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coach_profile_settings: nextSettings }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setProfileNotice('Please sign in to save profile details.')
        if (payload?.error) {
          setProfileNotice(payload.error)
        }
        return false
      }
      if (notice) {
        setProfileNotice(notice)
      }
      return true
    },
    []
  )

  const saveProfileFields = useCallback(async (updates: Record<string, unknown>) => {
    const response = await fetch('/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return { ok: false, error: payload?.error || 'Unable to save changes.' }
    }
    return { ok: true, error: null as string | null }
  }, [])

  const uploadAttachment = useCallback(async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/storage/attachment', {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      return null
    }
    return response.json()
  }, [])

  const handleSaveBranding = async () => {
    setBrandingSaving(true)
    setBrandingNotice('')
    const result = await saveProfileFields({
      brand_logo_url: brandLogoUrl || null,
      brand_cover_url: brandCoverUrl || null,
      brand_primary_color: brandPrimaryColor || null,
      brand_accent_color: brandAccentColor || null,
    })

    if (!result.ok) {
      setBrandingNotice(result.error || 'Unable to save branding.')
      setBrandingSaving(false)
      return
    }

    setBrandingNotice('Branding saved.')
    setToast('Save complete')
    triggerSaved('branding')
    setBrandingSaving(false)
  }

  const handleRefreshStripe = async () => {
    setPayoutSaving(true)
    setPayoutNotice('')
    try {
      const response = await fetch('/api/stripe/account', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        setPayoutNotice(data?.error || 'Unable to refresh Stripe details.')
        setPayoutSaving(false)
        return
      }
      setPayoutNotice('Stripe account refreshed.')
    } catch (error) {
      setPayoutNotice('Unable to refresh Stripe details.')
    }
    setPayoutSaving(false)
  }

  // Handle return from Stripe Connect onboarding.
  useEffect(() => {
    const stripeParam = searchParams.get('stripe')
    if (!stripeParam) return

    if (stripeParam === 'success') {
      // Sync the account status and bank details, then show confirmation.
      const verifyAccount = async () => {
        setPayoutSaving(true)
        try {
          const response = await fetch('/api/stripe/account', { method: 'POST' })
          const data = await response.json()
          if (response.ok) {
            setPayoutNotice('Stripe connected successfully. You can now accept payments.')
          } else {
            setPayoutNotice(data?.error || 'Stripe account setup may be incomplete. Click "Refresh Stripe" to check status.')
          }
        } catch {
          setPayoutNotice('Stripe account setup may be incomplete. Click "Refresh Stripe" to check status.')
        }
        setPayoutSaving(false)
        // Scroll to the payouts section and clean the URL.
        document.getElementById('payouts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        router.replace('/coach/settings#payouts')
      }
      void verifyAccount()
    } else if (stripeParam === 'refresh') {
      setPayoutNotice('Your Stripe setup link expired. Click "Connect Stripe" to try again.')
      document.getElementById('payouts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      router.replace('/coach/settings#payouts')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const handleSubmitVerification = async () => {
    if (idDocument) {
      const formData = new FormData()
      formData.append('file', idDocument)
      formData.append('type', 'gov_id')
      await fetch('/api/storage/verification', {
        method: 'POST',
        body: formData,
      })
    }
    if (certDocuments && certDocuments.length) {
      const formData = new FormData()
      Array.from(certDocuments).forEach((file) => formData.append('files', file))
      formData.append('type', 'certifications')
      await fetch('/api/storage/verification', {
        method: 'POST',
        body: formData,
      })
    }

    const response = await fetch('/api/coach/verification-submit', {
      method: 'POST',
    })
    const result = await response.json().catch(() => null)

    if (!response.ok || !result?.ok) {
      setToast(result?.error || 'Unable to submit verification.')
      return
    }

    setVerificationStatus('in_review')
    triggerSaved('verification')
    setToast('Verification submitted')
  }

  const handleUploadMedia = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setProfileMediaUploading(true)
    const uploads = await Promise.all(files.map((file) => uploadAttachment(file)))
    const now = new Date().toISOString()
    const nextMedia = [...profileMedia]
    uploads.forEach((data, index) => {
      if (!data?.url) return
      nextMedia.push({
        id: data.path || `${Date.now()}-${index}`,
        url: data.url,
        name: data.name || files[index].name,
        type: data.type || files[index].type || 'application/octet-stream',
        size: data.size || files[index].size || 0,
        uploaded_at: now,
      })
    })
    setProfileMedia(nextMedia)
    const ok = await persistProfileSettings(buildProfileSettings({ media: nextMedia }), 'Media uploaded.')
    if (ok) {
      setToast('Upload complete')
      triggerSaved('profile')
    }
    setProfileMediaUploading(false)
    event.target.value = ''
  }, [buildProfileSettings, persistProfileSettings, profileMedia, triggerSaved, uploadAttachment])

  const handleRemoveMedia = useCallback(async (id: string) => {
    const nextMedia = profileMedia.filter((item) => item.id !== id)
    setProfileMedia(nextMedia)
    await persistProfileSettings(buildProfileSettings({ media: nextMedia }), 'Media updated.')
  }, [buildProfileSettings, persistProfileSettings, profileMedia])

  const handleUploadCertification = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCertFileUploading(true)
    const data = await uploadAttachment(file)
    if (!data?.url) {
      setProfileNotice('Unable to upload certificate.')
      setCertFileUploading(false)
      return
    }
    const nextCertification = {
      name: certName.trim(),
      organization: certOrg.trim(),
      date: certDate,
      fileUrl: data.url,
    }
    setCertFileUrl(data.url)
    await persistProfileSettings(buildProfileSettings({ certification: nextCertification }), 'Certificate uploaded.')
    triggerSaved('profile')
    setCertFileUploading(false)
    event.target.value = ''
  }, [buildProfileSettings, certDate, certName, certOrg, persistProfileSettings, triggerSaved, uploadAttachment])

  const handleRemoveCertification = useCallback(async () => {
    setCertFileUrl('')
    await persistProfileSettings(
      buildProfileSettings({
        certification: {
          name: certName.trim(),
          organization: certOrg.trim(),
          date: certDate,
          fileUrl: '',
        },
      }),
      'Certificate removed.'
    )
    triggerSaved('profile')
  }, [buildProfileSettings, certDate, certName, certOrg, persistProfileSettings, triggerSaved])

  const handleSaveProfile = async () => {
    setProfileSaving(true)
    setProfileNotice('')
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setProfileNotice('Please sign in to save profile details.')
      setProfileSaving(false)
      return
    }
    const seasons = coachSeasonsInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const grades = coachGradesInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const certificationLabel = certName || certOrg || certDate
      ? [certName, certOrg, certDate].filter(Boolean).join(' · ')
      : ''
    const profileSettings = buildProfileSettings()

    const response = await fetch('/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName.trim() || null,
        bio: profileBio.trim() || null,
        certifications: certificationLabel || null,
        coach_seasons: seasons.length ? seasons : null,
        coach_grades: grades.length ? grades : null,
        coach_profile_settings: profileSettings,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setProfileNotice('Unable to save profile details.')
      if (payload?.error) {
        setProfileNotice(payload.error)
      }
    } else {
      await supabase.auth.updateUser({ data: { full_name: fullName.trim() || null } })
      const trimmedName = fullName.trim()
      // Cache profile data to localStorage so profile page can show it immediately
      if (typeof window !== 'undefined') {
        if (profileBio.trim()) window.localStorage.setItem('ch_bio', profileBio.trim())
        else window.localStorage.removeItem('ch_bio')
        window.localStorage.setItem('ch_coach_profile_settings', JSON.stringify(profileSettings))
        if (seasons.length) window.localStorage.setItem('ch_coach_seasons', JSON.stringify(seasons))
        if (grades.length) window.localStorage.setItem('ch_coach_grades', JSON.stringify(grades))
      }
      await loadProfile()
      if (trimmedName) {
        broadcastCoachProfileUpdate({ name: trimmedName, avatarUrl })
      } else {
        broadcastCoachProfileUpdate({ avatarUrl })
      }
      router.refresh()
      setProfileNotice('Profile details saved.')
      setToast('Save complete')
      triggerSaved('profile')
    }
    setProfileSaving(false)
  }

  const fetchSecuritySettings = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('coach_security_settings')
      .eq('id', userId)
      .maybeSingle()
    return (data?.coach_security_settings || {}) as Record<string, unknown>
  }, [supabase])

  const persistSecuritySettings = useCallback(
    async (userId: string, updates: Record<string, unknown>) => {
      const current = await fetchSecuritySettings(userId)
      const nextSettings = { ...current, ...updates }
      const result = await saveProfileFields({ coach_security_settings: nextSettings })
      if (!result.ok) {
        setSecurityNotice(result.error || 'Unable to save security settings.')
        return null
      }
      return nextSettings
    },
    [fetchSecuritySettings, saveProfileFields]
  )

  const handleSaveSecurity = async () => {
    setSecuritySaving(true)
    setSecurityNotice('')
    const updates: { email?: string; phone?: string; password?: string } = {}
    const trimmedEmail = securityEmail.trim()
    const trimmedPhone = securityPhone.trim()
    const trimmedPassword = securityPassword.trim()
    const emailChanged =
      Boolean(trimmedEmail) &&
      trimmedEmail.toLowerCase() !== (originalSecurityEmail || '').trim().toLowerCase()
    if (trimmedEmail) updates.email = trimmedEmail
    if (trimmedPhone) updates.phone = trimmedPhone
    if (trimmedPassword) updates.password = trimmedPassword
    if (Object.keys(updates).length) {
      const { error } = await supabase.auth.updateUser(updates)
      if (error) {
        setSecurityNotice(error.message || 'Unable to update account details.')
        setSecuritySaving(false)
        return
      }
      if (emailChanged) {
        setOriginalSecurityEmail(trimmedEmail)
      }
    }
    const mfa = (supabase.auth as any).mfa
    if (securityMethod === 'off' && verifiedFactorId && mfa?.unenroll) {
      const { error } = await mfa.unenroll({ factorId: verifiedFactorId })
      if (error) {
        setSecurityNotice(error.message || 'Unable to disable two-factor.')
        setSecuritySaving(false)
        return
      }
      setVerifiedFactorId(null)
    }
    if (securityMethod === 'authenticator' && !verifiedFactorId && !pendingFactorId && mfa?.enroll) {
      const { data, error } = await mfa.enroll({ factorType: 'totp' })
      if (error || !data?.id) {
        setSecurityNotice(error?.message || 'Unable to start two-factor enrollment.')
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

    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setSecurityNotice('Please sign in to save security settings.')
      setSecuritySaving(false)
      return
    }
    const nextSettings = await persistSecuritySettings(userId, {
      twoFactorMethod: securityMethod,
      passkeys,
    })
    if (nextSettings) {
      setSecurityNotice(
        emailChanged
          ? 'Security settings saved. Check your inbox to confirm the new email address before it takes effect.'
          : 'Security settings saved.'
      )
      setToast('Save complete')
      triggerSaved('security')
    }
    setSecuritySaving(false)
    setSecurityPassword('')
  }

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
    setSecurityMethod('authenticator')
    setPendingFactorId(null)
    setMfaModalOpen(false)
    setMfaQr(null)
    setMfaSecret(null)
    setMfaCode('')
    setSecurityNotice('Two-factor authentication enabled.')
    setToast('Two-factor enabled')
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (userId) {
      await persistSecuritySettings(userId, {
        twoFactorMethod: 'authenticator',
        passkeys,
      })
    }
  }, [mfaCode, passkeys, pendingFactorId, persistSecuritySettings, supabase])

  const handleCancelMfa = useCallback(async () => {
    if (pendingFactorId) {
      const mfa = (supabase.auth as any).mfa
      if (mfa?.unenroll) {
        try {
          await mfa.unenroll({ factorId: pendingFactorId })
        } catch (error) {
          // Best-effort cleanup.
        }
      }
    }
    setPendingFactorId(null)
    setMfaModalOpen(false)
    setMfaQr(null)
    setMfaSecret(null)
    setMfaCode('')
    setMfaNotice('')
    setSecurityMethod(verifiedFactorId ? 'authenticator' : 'off')
  }, [pendingFactorId, verifiedFactorId, supabase])

  const handleGenerateRecoveryCodes = useCallback(async () => {
    setRecoveryLoading(true)
    setRecoveryNotice('')
    const response = await fetch('/api/coach/security/recovery-codes', { method: 'POST' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setRecoveryNotice(payload?.error || 'Unable to generate recovery codes.')
      setRecoveryLoading(false)
      return
    }
    const codes = Array.isArray(payload?.codes) ? payload.codes : []
    setRecoveryCodes(codes)
    setRecoveryModalOpen(true)
    setRecoveryLoading(false)
  }, [])

  const handleCopyRecoveryCodes = useCallback(async () => {
    if (!recoveryCodes.length) return
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'))
      setToast('Recovery codes copied')
    } catch (error) {
      setToast('Unable to copy recovery codes')
    }
  }, [recoveryCodes])

  const handleAddPasskey = useCallback(async () => {
    const label = passkeyName.trim()
    if (!label) {
      setPasskeyNotice('Add a device name for this passkey.')
      return
    }
    setPasskeySaving(true)
    setPasskeyNotice('')
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setPasskeyNotice('Please sign in to manage passkeys.')
      setPasskeySaving(false)
      return
    }
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `passkey-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const nextPasskeys = [
      ...passkeys,
      {
        id,
        label,
        created_at: new Date().toISOString(),
      },
    ]
    const nextSettings = await persistSecuritySettings(userId, { passkeys: nextPasskeys })
    if (nextSettings) {
      setPasskeys(nextPasskeys)
      setPasskeyName('')
      setPasskeyNotice('Passkey saved.')
    }
    setPasskeySaving(false)
  }, [passkeyName, passkeys, persistSecuritySettings, supabase])

  const handleRemovePasskey = useCallback(async (id: string) => {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) return
    const nextPasskeys = passkeys.filter((item) => item.id !== id)
    const nextSettings = await persistSecuritySettings(userId, { passkeys: nextPasskeys })
    if (nextSettings) {
      setPasskeys(nextPasskeys)
      setPasskeyNotice('Passkey removed.')
    }
  }, [passkeys, persistSecuritySettings, supabase])

  const handleSavePolicies = async () => {
    setPolicySaving(true)
    setPolicyNotice('')
    const result = await saveProfileFields({
      coach_cancel_window: policyCancelWindow,
      coach_reschedule_window: policyRescheduleWindow,
      coach_refund_policy: policyRefundText || null,
    })

    if (!result.ok) {
      setPolicyNotice(result.error || 'Unable to save session policies.')
    } else {
      setPolicyNotice('Session policies saved.')
      setToast('Save complete')
      triggerSaved('policies')
    }
    setPolicySaving(false)
  }

  const handleSaveCommunication = async () => {
    setCommSaving(true)
    setCommNotice('')
    const result = await saveProfileFields({
      coach_messaging_hours: commHours || null,
      coach_auto_reply: commAutoReply || null,
      coach_silence_outside_hours: commSilenceOutside,
    })

    if (!result.ok) {
      setCommNotice(result.error || 'Unable to save communication settings.')
    } else {
      setCommNotice('Communication preferences saved.')
      setToast('Save complete')
      triggerSaved('communication')
    }
    setCommSaving(false)
  }

  const handleSaveNotifications = async () => {
    setNotificationSaving(true)
    setNotificationNotice('')
    const result = await saveProfileFields({
      notification_prefs: notificationPrefs,
    })

    if (!result.ok) {
      setNotificationNotice(result.error || 'Unable to save notification settings.')
    } else {
      setNotificationNotice('Notification preferences saved.')
      setToast('Save complete')
      triggerSaved('notifications')
    }
    setNotificationSaving(false)
  }

  const persistIntegrations = async (nextSettings: IntegrationSettings, notice?: string) => {
    const result = await saveProfileFields({ integration_settings: nextSettings })
    if (!result.ok) {
      setIntegrationNotice(result.error || 'Unable to save integrations.')
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
    if (ok) {
      setToast('Save complete')
      triggerSaved('integrations')
    }
    setIntegrationSaving(false)
  }

  const handleOpenStripeDashboard = async () => {
    setStripeLoginLoading(true)
    setPayoutNotice('')
    try {
      const response = await fetch('/api/stripe/login-link', { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.url) {
        setPayoutNotice(data?.error || 'Unable to open Stripe dashboard.')
        setStripeLoginLoading(false)
        return
      }
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setPayoutNotice('Unable to open Stripe dashboard.')
    }
    setStripeLoginLoading(false)
  }

  const handleConnectStripe = async () => {
    setStripeConnectLoading(true)
    setPayoutNotice('')
    try {
      const response = await fetch('/api/stripe/connect', { method: 'POST' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        setPayoutNotice(payload?.error || 'Unable to start Stripe onboarding.')
        setStripeConnectLoading(false)
        return
      }
      if (payload?.stripe_account_id) {
        setStripeAccountId(payload.stripe_account_id)
      }
      window.location.href = payload.url
    } catch (error) {
      setPayoutNotice('Unable to start Stripe onboarding.')
    }
    setStripeConnectLoading(false)
  }

  const handleSavePrivacy = async () => {
    setPrivacySaving(true)
    setPrivacyNotice('')
    const result = await saveProfileFields({ coach_privacy_settings: privacySettings })
    if (!result.ok) {
      setPrivacyNotice(result.error || 'Unable to save privacy settings.')
    } else {
      setPrivacyNotice('Privacy settings saved.')
      setToast('Save complete')
      triggerSaved('privacy')
    }
    setPrivacySaving(false)
  }

  const handleConnectProvider = async (provider: 'google' | 'zoom' | 'apple') => {
    if (provider === 'apple') {
      setIntegrationConnecting((prev) => ({ ...prev, [provider]: true }))
      const now = new Date().toISOString()
      const nextSettings: IntegrationSettings = {
        ...integrationSettings,
        connections: {
          ...integrationSettings.connections,
          apple: { subscribed: true, subscribed_at: now },
        },
        calendarProvider: 'apple',
      }
      setIntegrationSettings(nextSettings)
      const ok = await persistIntegrations(nextSettings, 'Apple Calendar connected.')
      if (ok) {
        setToast('Integration connected')
      }
      setIntegrationConnecting((prev) => ({ ...prev, [provider]: false }))
      return
    }
    setIntegrationConnecting((prev) => ({ ...prev, [provider]: true }))
    const returnTo = encodeURIComponent('/coach/settings?integration=connected')
    window.open(`/api/integrations/${provider}/connect?returnTo=${returnTo}`, '_blank', 'noopener,noreferrer')
  }

  const handleDisconnectProvider = async (provider: 'google' | 'zoom' | 'apple') => {
    if (provider === 'apple') {
      setIntegrationConnecting((prev) => ({ ...prev, [provider]: true }))
      const nextSettings: IntegrationSettings = {
        ...integrationSettings,
        connections: {
          ...integrationSettings.connections,
          apple: { subscribed: false },
        },
        calendarProvider: integrationSettings.calendarProvider === 'apple' ? 'none' : integrationSettings.calendarProvider,
      }
      setIntegrationSettings(nextSettings)
      const ok = await persistIntegrations(nextSettings, 'Apple Calendar disconnected.')
      if (ok) {
        setToast('Integration disconnected')
      }
      setIntegrationConnecting((prev) => ({ ...prev, [provider]: false }))
      return
    }
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
    setToast('Integration disconnected')
    setIntegrationConnecting((prev) => ({ ...prev, [provider]: false }))
  }

  const handleGenerateCalendarFeed = async () => {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setIntegrationNotice('Please sign in to generate a feed link.')
      return
    }
    const token = calendarFeedToken || (crypto?.randomUUID ? crypto.randomUUID() : `${userId}-${Date.now()}`)
    const result = await saveProfileFields({ calendar_feed_token: token })
    if (!result.ok) {
      setIntegrationNotice(result.error || 'Unable to generate calendar feed.')
      return
    }
    setCalendarFeedToken(token)
    setToast('Calendar feed link ready')
  }

  const handleCopyFeed = async () => {
    if (!calendarFeedUrl) return
    try {
      await navigator.clipboard.writeText(calendarFeedUrl)
      setToast('Calendar feed link copied')
    } catch (error) {
      setToast('Unable to copy feed link')
    }
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
    window.location.assign('/coach/dashboard?billing=canceled')
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

  const tierLabel = coachTier.charAt(0).toUpperCase() + coachTier.slice(1)
  const sessionFee = getFeePercentage(coachTier, 'session', feeRules)
  const marketplaceDigitalFee = getFeePercentage(coachTier, 'marketplace_digital', feeRules)
  const marketplacePhysicalFee = getFeePercentage(coachTier, 'marketplace_physical', feeRules)
  const googleConnected = integrationSettings.connections.google.connected
  const zoomConnected = integrationSettings.connections.zoom.connected
  const verificationLabel =
    verificationStatus === 'verified'
      ? 'Verified'
      : verificationStatus === 'in_review'
        ? 'In review'
        : 'Not submitted'
  const verificationChipClassName =
    verificationStatus === 'verified'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : verificationStatus === 'in_review'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-[#dcdcdc] bg-[#f5f5f5] text-[#4a4a4a]'
  const mobileJumpSections = [
    { href: '#profile', label: 'Profile' },
    { href: '#verification', label: 'Verification' },
    { href: '#security', label: 'Security' },
    { href: '#branding', label: 'Branding' },
    { href: '#policies', label: 'Policies' },
    { href: '#communication', label: 'Communication' },
    { href: '#notifications', label: 'Notifications' },
    { href: '#payouts', label: 'Payouts' },
    { href: '#plans', label: 'Plans' },
    ...(showAdvanced
      ? [
          { href: '#integrations', label: 'Integrations' },
          { href: '#privacy', label: 'Privacy' },
          { href: '#export-center', label: 'Export center' },
        ]
      : []),
    { href: '#account', label: 'Account controls' },
  ]

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Settings</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Coach settings</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Update profile, notifications, payouts, and privacy preferences.
            </p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            <Link
              href="/coach/profile"
              className="inline-flex w-full justify-center rounded-full border border-[#191919] bg-white px-4 py-2 text-sm font-semibold text-[#191919] transition hover:bg-[#f7f6f4] sm:w-auto"
            >
              Go to profile
            </Link>
            <RoleSwitcher hideOrgOptions />
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)_220px]">
          <CoachSidebar />
          <div className="min-w-0 flex flex-col gap-6 [&>*]:min-w-0">
            <MobileSectionJumpNav
              sections={mobileJumpSections}
              actionLabel={showAdvanced ? undefined : 'Show advanced'}
              onAction={showAdvanced ? undefined : () => setShowAdvanced(true)}
            />
            <section id="profile" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Profile</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">
                    Edit your public profile, specialties, and default rates.
                  </p>
                </div>
              </div>

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

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Full name</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="Jordan Smith"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Title / specialty</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="Strength & Conditioning | Speed"
                    value={profileTitle}
                    onChange={(event) => setProfileTitle(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Location</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="City, State or Remote"
                    value={profileLocation}
                    onChange={(event) => setProfileLocation(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Primary sport focus</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="Track, Soccer, Basketball..."
                    value={profileSport}
                    onChange={(event) => setProfileSport(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Seasons coached</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="Fall, Winter, Spring, Summer"
                    value={coachSeasonsInput}
                    onChange={(event) => setCoachSeasonsInput(event.target.value)}
                  />
                  <span className="text-xs text-[#4a4a4a]">Comma-separated list.</span>
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Grades coached</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="6, 7, 8, 9, 10, 11, 12"
                    value={coachGradesInput}
                    onChange={(event) => setCoachGradesInput(event.target.value)}
                  />
                  <span className="text-xs text-[#4a4a4a]">Comma-separated list.</span>
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Years of experience</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="e.g., 8+ years"
                    value={yearsExperience}
                    onChange={(event) => setYearsExperience(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Session formats</span>
                  <select
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    value={sessionFormats}
                    onChange={(event) => setSessionFormats(event.target.value)}
                  >
                    <option value="">Select format</option>
                    <option value="In-person">In-person</option>
                    <option value="Virtual">Virtual</option>
                    <option value="In-person & virtual">In-person & virtual</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Typical response time</span>
                  <select
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    value={responseTime}
                    onChange={(event) => setResponseTime(event.target.value)}
                  >
                    <option value="">Select response time</option>
                    <option value="within 1 hour">Within 1 hour</option>
                    <option value="within 2 hours">Within 2 hours</option>
                    <option value="within 24 hours">Within 24 hours</option>
                    <option value="within 48 hours">Within 48 hours</option>
                  </select>
                </label>
                <div className="space-y-2 text-sm text-[#191919]">
                  <span>Levels coached</span>
                  <div className="mt-1 grid grid-cols-2 gap-3">
                    {(['Youth (8-12)', 'High School', 'College', 'Adult / Pro'] as const).map((level) => (
                      <label key={level} className="flex min-w-0 items-center gap-2 break-words text-xs sm:text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-[#dcdcdc]"
                          checked={coachLevelsInput.includes(level)}
                          onChange={(e) => {
                            setCoachLevelsInput(e.target.checked
                              ? [...coachLevelsInput, level]
                              : coachLevelsInput.filter((l) => l !== level)
                            )
                          }}
                        />
                        <span>{level}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <label className="mt-3 block space-y-2 text-sm text-[#191919]">
                <span>Bio</span>
                <textarea
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  rows={4}
                  placeholder="Experience, coaching philosophy, certifications, and what athletes can expect."
                  value={profileBio}
                  onChange={(event) => setProfileBio(event.target.value)}
                />
              </label>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Certification name</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="USSF C License, NASM CPT"
                    value={certName}
                    onChange={(event) => setCertName(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Issuing organization</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="USSF, NASM, NSCA"
                    value={certOrg}
                    onChange={(event) => setCertOrg(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Date earned</span>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={certDate}
                    onChange={(event) => setCertDate(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Upload certificate</span>
                  <input
                    type="file"
                    className="block w-full max-w-full text-sm text-[#4a4a4a]"
                    onChange={handleUploadCertification}
                  />
                  {certFileUploading ? (
                    <span className="text-xs text-[#4a4a4a]">Uploading certificate...</span>
                  ) : certFileUrl ? (
                    <span className="flex flex-wrap items-center gap-2 text-xs text-[#4a4a4a]">
                      <a
                        href={certFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[#b80f0a]"
                      >
                        View uploaded certificate
                      </a>
                      <button type="button" onClick={handleRemoveCertification} className="text-[#191919] underline">
                        Remove
                      </button>
                    </span>
                  ) : (
                    <span className="text-xs text-[#4a4a4a]">PDF or image files supported.</span>
                  )}
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>1-on-1 session rate</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="e.g., 100"
                    value={rateOneOnOne}
                    onChange={(event) => setRateOneOnOne(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Team session rate</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="e.g., 250"
                    value={rateTeam}
                    onChange={(event) => setRateTeam(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Group session rate</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="e.g., 150"
                    value={rateGroup}
                    onChange={(event) => setRateGroup(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Virtual call rate</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="e.g., 75"
                    value={rateVirtual}
                    onChange={(event) => setRateVirtual(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Assessment rate</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="e.g., 120"
                    value={rateAssessment}
                    onChange={(event) => setRateAssessment(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  onClick={handleSaveProfile}
                  disabled={profileSaving}
                >
                  {profileSaving ? 'Saving...' : 'Save profile'}
                </button>
                {savedFlags.profile && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  className="rounded-full border border-[#191919] px-5 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Upload media
                </button>
                <input
                  ref={mediaInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleUploadMedia}
                />
                {profileNotice && <span className="text-xs text-[#4a4a4a]">{profileNotice}</span>}
              </div>
              {profileMediaUploading ? (
                <p className="mt-2 text-xs text-[#4a4a4a]">Uploading media...</p>
              ) : null}
              {profileMedia.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {profileMedia.map((item) => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-2 rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#191919]"
                    >
                      {item.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveMedia(item.id)}
                        className="text-[#b80f0a]"
                      >
                        Remove
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </section>

            <section id="verification" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Verification</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Complete verification to earn a verified badge and build trust with athletes viewing your profile.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${verificationChipClassName}`}>
                    {verificationLabel}
                  </span>
                  {verificationStatus !== 'verified' ? (
                    <button
                      className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleSubmitVerification}
                      disabled={verificationStatus === 'in_review'}
                    >
                      {verificationStatus === 'in_review' ? 'Submitted' : 'Submit for review'}
                    </button>
                  ) : null}
                  {savedFlags.verification && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Submitted
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#191919]">Government ID</span>
                  <input
                    type="file"
                    className="block w-full max-w-full text-sm text-[#4a4a4a]"
                    onChange={(event) => setIdDocument(event.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-[#4a4a4a]">Upload a clear photo of your ID.</p>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#191919]">Certifications / Licenses</span>
                  <input
                    type="file"
                    multiple
                    className="block w-full max-w-full text-sm text-[#4a4a4a]"
                    onChange={(event) => setCertDocuments(event.target.files)}
                  />
                  <p className="text-xs text-[#4a4a4a]">Upload proof of certifications.</p>
                </label>
              </div>
              <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                <p className="font-semibold text-[#191919]">Checklist</p>
                <ul className="mt-2 space-y-1 text-xs text-[#4a4a4a]">
                  <li>• Profile completeness (name, bio, rates, availability)</li>
                  <li>• Government ID uploaded</li>
                  <li>• Certifications / licenses uploaded</li>
                </ul>
              </div>
            </section>

            <section id="security" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Account & security</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Login, recovery, and 2FA settings.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveSecurity}
                    disabled={securitySaving}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
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
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Email</span>
                  <input
                    type="email"
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="coach@example.com"
                    value={securityEmail}
                    onChange={(event) => setSecurityEmail(event.target.value)}
                  />
                  <p className="text-[11px] text-[#4a4a4a]">
                    Changing this email sends a confirmation link before the new address becomes active.
                  </p>
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Phone</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="+1 (555) 123-4567"
                    value={securityPhone}
                    onChange={(event) => setSecurityPhone(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Update password</span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="New password"
                    value={securityPassword}
                    onChange={(event) => setSecurityPassword(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Two-factor authentication</span>
                  <select
                    value={securityMethod}
                    onChange={(event) => setSecurityMethod(event.target.value as CoachSecuritySettings['twoFactorMethod'])}
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  >
                    <option value="off">Off</option>
                    <option value="authenticator">Authenticator app</option>
                  </select>
                </label>
              </div>
              {securityNotice && <p className="mt-3 text-xs text-[#4a4a4a]">{securityNotice}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <button
                  type="button"
                  onClick={handleGenerateRecoveryCodes}
                  disabled={recoveryLoading}
                  className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  {recoveryLoading ? 'Generating...' : 'Recovery codes'}
                </button>
                <button
                  type="button"
                  onClick={() => setPasskeyModalOpen(true)}
                  className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Manage passkeys
                </button>
              </div>
            </section>

            <section id="branding" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Branding</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Logo, colors, and storefront visuals.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    onClick={handleSaveBranding}
                    disabled={brandingSaving}
                  >
                    {brandingSaving ? 'Saving...' : 'Save branding'}
                  </button>
                  {savedFlags.branding && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Saved
                    </span>
                  )}
                </div>
              </div>
              {brandingNotice ? (
                <p className="mt-2 text-xs text-[#4a4a4a]">{brandingNotice}</p>
              ) : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-xs font-semibold text-[#4a4a4a]">Logo</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div
                      className="h-12 w-12 rounded-full border border-[#191919] bg-white bg-cover bg-center"
                      style={{ backgroundImage: brandLogoUrl ? `url(${brandLogoUrl})` : 'none' }}
                    />
                    <label className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]">
                      Upload logo
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => handleBrandingUpload('logo', event)}
                      />
                    </label>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-xs font-semibold text-[#4a4a4a]">Cover image</p>
                  <div
                    className="mt-3 h-24 rounded-2xl border border-[#dcdcdc] bg-white bg-cover bg-center"
                    style={{ backgroundImage: brandCoverUrl ? `url(${brandCoverUrl})` : 'none' }}
                  />
                  <label className="mt-3 inline-flex rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]">
                    Upload cover
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => handleBrandingUpload('cover', event)}
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Primary brand color</span>
                  <input
                    value={brandPrimaryColor}
                    onChange={(event) => setBrandPrimaryColor(event.target.value)}
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="#191919"
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Accent color</span>
                  <input
                    value={brandAccentColor}
                    onChange={(event) => setBrandAccentColor(event.target.value)}
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="#b80f0a"
                  />
                </label>
              </div>
              {brandingUploading ? (
                <p className="mt-2 text-xs text-[#4a4a4a]">Uploading branding asset...</p>
              ) : null}
            </section>


            <section id="policies" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Session policies</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Cancellation and refund rules.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSavePolicies}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                    disabled={policySaving}
                  >
                    {policySaving ? 'Saving...' : 'Save policies'}
                  </button>
                  {savedFlags.policies && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Saved
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Cancellation window</span>
                  <select
                    value={policyCancelWindow}
                    onChange={(event) => setPolicyCancelWindow(event.target.value)}
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  >
                    <option>24 hours</option>
                    <option>12 hours</option>
                    <option>48 hours</option>
                    <option>72 hours</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Reschedule window</span>
                  <select
                    value={policyRescheduleWindow}
                    onChange={(event) => setPolicyRescheduleWindow(event.target.value)}
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  >
                    <option>Up to 12 hours</option>
                    <option>Up to 24 hours</option>
                    <option>Up to 48 hours</option>
                    <option>Up to 72 hours</option>
                  </select>
                </label>
              </div>
              <label className="mt-3 block space-y-2 text-sm text-[#191919]">
                <span>Refund policy text</span>
                <textarea
                  value={policyRefundText}
                  onChange={(event) => setPolicyRefundText(event.target.value)}
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  rows={3}
                  placeholder="Explain how refunds are handled."
                />
              </label>
              {policyNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{policyNotice}</p> : null}
            </section>

            <section id="communication" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Communication rules</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Set messaging hours and auto replies.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveCommunication}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                    disabled={commSaving}
                  >
                    {commSaving ? 'Saving...' : 'Save communication'}
                  </button>
                  {savedFlags.communication && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Saved
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Messaging hours</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="9am - 6pm"
                    value={commHours}
                    onChange={(event) => setCommHours(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Auto-reply</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="Thanks! I'll reply within 24 hours."
                    value={commAutoReply}
                    onChange={(event) => setCommAutoReply(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#191919]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={commSilenceOutside}
                    onChange={(event) => setCommSilenceOutside(event.target.checked)}
                    className="h-4 w-4 border-[#191919] text-[#b80f0a]"
                  />
                  <span>Silence messages outside hours</span>
                </label>
              </div>
              {commNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{commNotice}</p> : null}
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
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {notificationCategories.map((label) => {
                  const key = toCategoryKey(label)
                  const prefs = notificationPrefs[key]
                  return (
                    <div key={label} className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 space-y-2 text-sm text-[#191919]">
                      <p className="font-semibold text-[#191919]">{label}</p>
                      <div className="flex flex-wrap gap-3 text-xs">
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


            

            <section id="payouts" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Payments & payouts</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Stripe connection and plan-controlled payout timing.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                    onClick={handleConnectStripe}
                    disabled={stripeConnectLoading}
                  >
                    {stripeConnectLoading ? 'Opening...' : stripeAccountId ? 'Reconnect Stripe' : 'Connect Stripe'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                    onClick={handleOpenStripeDashboard}
                    disabled={stripeLoginLoading || !stripeAccountId}
                  >
                    {stripeLoginLoading ? 'Opening...' : 'Manage in Stripe'}
                  </button>
                  <button
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                    onClick={handleRefreshStripe}
                    disabled={payoutSaving || !stripeAccountId}
                  >
                    Refresh Stripe
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-sm text-[#191919]">
                  <p className="font-semibold">Payment provider</p>
                  <p className="text-xs text-[#4a4a4a]">{stripeAccountId ? 'Stripe connected' : 'Stripe not connected'}</p>
                </div>
                <div className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-sm text-[#191919]">
                  <p className="font-semibold">Payout schedule</p>
                  <p className="text-xs text-[#4a4a4a]">{payoutCadenceLabel}</p>
                </div>
                <div className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-sm text-[#191919]">
                  <p className="font-semibold">Payout day</p>
                  <p className="text-xs text-[#4a4a4a]">{payoutAnchorLabel}</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-[#4a4a4a]">
                Payout timing is assigned by your current plan. The payout day is anchored to the day your coach plan started and cannot be changed in the portal.
              </p>
              {payoutNotice ? (
                <p className="mt-3 text-xs text-[#4a4a4a]">{payoutNotice}</p>
              ) : null}
            </section>

            <section id="plans" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Subscriptions & plans</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Review your plan and platform fees.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setManagePlanModalOpen(true)}
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Manage plans
                </button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm text-[#191919]">
                <div className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3">
                  <p className="font-semibold">Current plan</p>
                  <p className="text-xs text-[#4a4a4a]">
                    {tierLabel}
                    {billingInfo?.status === 'trialing'
                      ? ` · Trial ends ${renewalDate}`
                      : billingInfo?.cancel_at_period_end
                        ? ` · Cancels ${renewalDate}`
                        : ` · Renews ${renewalDate}`}
                  </p>
                  {billingInfo?.status && billingInfo.status !== 'active' && billingInfo.status !== 'trialing' && (
                    <p className="mt-0.5 text-xs font-semibold text-[#b80f0a] capitalize">{billingInfo.status.replace(/_/g, ' ')}</p>
                  )}
                </div>
                <div className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3">
                  <p className="font-semibold">Platform fee</p>
                  <p className="text-xs text-[#4a4a4a]">Sessions: {sessionFee}%</p>
                  <p className="text-xs text-[#4a4a4a]">Marketplace: {marketplaceDigitalFee}% digital · {marketplacePhysicalFee}% physical</p>
                </div>
              </div>
            </section>

            <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Advanced settings</p>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Integrations and privacy controls.</p>
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
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveIntegrations}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                    disabled={integrationSaving}
                  >
                    {integrationSaving ? 'Saving...' : 'Save integrations'}
                  </button>
                  {savedFlags.integrations && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Saved
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#191919]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Google Calendar + Meet</p>
                      <p className="mt-1 text-xs text-[#4a4a4a]">Sync sessions and auto-create Meet links.</p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                        googleConnected ? 'border-[#b80f0a] bg-white text-[#b80f0a]' : 'border-[#191919] text-[#191919]'
                      }`}
                    >
                      {googleConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => (googleConnected ? handleDisconnectProvider('google') : handleConnectProvider('google'))}
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                      disabled={integrationConnecting.google}
                    >
                      {integrationConnecting.google ? 'Working...' : googleConnected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#191919]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Zoom</p>
                      <p className="mt-1 text-xs text-[#4a4a4a]">Generate Zoom links for sessions.</p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                        zoomConnected ? 'border-[#b80f0a] bg-white text-[#b80f0a]' : 'border-[#191919] text-[#191919]'
                      }`}
                    >
                      {zoomConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => (zoomConnected ? handleDisconnectProvider('zoom') : handleConnectProvider('zoom'))}
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                      disabled={integrationConnecting.zoom}
                    >
                      {integrationConnecting.zoom ? 'Working...' : zoomConnected ? 'Disconnect' : 'Connect'}
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
                      setIntegrationSettings((prev) => ({ ...prev, calendarProvider: event.target.value as IntegrationSettings['calendarProvider'] }))
                    }
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  >
                    <option value="none">None</option>
                    <option value="google">Google Calendar</option>
                    <option value="apple">Apple Calendar</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Default video link</span>
                  <select
                    value={integrationSettings.videoProvider}
                    onChange={(event) =>
                      setIntegrationSettings((prev) => ({ ...prev, videoProvider: event.target.value as IntegrationSettings['videoProvider'] }))
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
                  <h3 className="text-lg font-semibold text-[#191919]">Privacy</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Visibility and messaging controls.</p>
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
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex items-start gap-3 text-sm text-[#191919]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 border-[#191919] text-[#b80f0a]"
                    checked={privacySettings.visibleToAthletes}
                    onChange={(event) =>
                      setPrivacySettings((prev) => ({ ...prev, visibleToAthletes: event.target.checked }))
                    }
                  />
                  <span>
                    Visible to athletes searching for coaches
                    <p className="text-xs text-[#4a4a4a]">Adjust visibility for this setting.</p>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm text-[#191919]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 border-[#191919] text-[#b80f0a]"
                    checked={privacySettings.allowDirectMessages}
                    onChange={(event) =>
                      setPrivacySettings((prev) => ({ ...prev, allowDirectMessages: event.target.checked }))
                    }
                  />
                  <span>
                    Allow athletes to message you directly
                    <p className="text-xs text-[#4a4a4a]">Adjust visibility for this setting.</p>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm text-[#191919]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 border-[#191919] text-[#b80f0a]"
                    checked={privacySettings.showProgressSnapshots}
                    onChange={(event) =>
                      setPrivacySettings((prev) => ({ ...prev, showProgressSnapshots: event.target.checked }))
                    }
                  />
                  <span>
                    Progress snapshots visible in athlete portal
                    <p className="text-xs text-[#4a4a4a]">Adjust visibility for this setting.</p>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm text-[#191919]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 border-[#191919] text-[#b80f0a]"
                    checked={privacySettings.showRatings}
                    onChange={(event) =>
                      setPrivacySettings((prev) => ({ ...prev, showRatings: event.target.checked }))
                    }
                  />
                  <span>
                    Show ratings and testimonials on your profile
                    <p className="text-xs text-[#4a4a4a]">Adjust visibility for this setting.</p>
                  </span>
                </label>
              </div>
              {privacyNotice && <p className="mt-3 text-xs text-[#4a4a4a]">{privacyNotice}</p>}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Blocked athletes</span>
                  <textarea
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    rows={3}
                    placeholder="List athletes or emails to block"
                    value={privacySettings.blockedAthletes}
                    onChange={(event) =>
                      setPrivacySettings((prev) => ({ ...prev, blockedAthletes: event.target.value }))
                    }
                  />
                </label>
                <label className="space-y-2 text-sm text-[#191919]">
                  <span>Region visibility</span>
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="United States, Canada"
                    value={privacySettings.regionVisibility}
                    onChange={(event) =>
                      setPrivacySettings((prev) => ({ ...prev, regionVisibility: event.target.value }))
                    }
                  />
                </label>
              </div>
            </section>
            <section id="export-center" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Export center</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Download bookings, payouts, roster, reviews, marketplace, and invoice data.</p>
                </div>
                <Link
                  href="/support"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Contact support
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ExportButtons endpoint="/api/coach/exports?type=bookings" filenamePrefix="coach-bookings" label="Bookings" showDateRange />
                <ExportButtons endpoint="/api/coach/exports?type=payouts" filenamePrefix="coach-payouts" label="Payouts" showDateRange />
                <ExportButtons endpoint="/api/coach/exports?type=invoices" filenamePrefix="coach-invoices" label="Invoices" showDateRange />
                <ExportButtons endpoint="/api/coach/exports?type=availability" filenamePrefix="coach-availability" label="Availability" />
                <ExportButtons endpoint="/api/coach/exports?type=roster" filenamePrefix="coach-roster" label="Athletes" />
                <ExportButtons endpoint="/api/coach/exports?type=reviews" filenamePrefix="coach-reviews" label="Reviews" showDateRange />
                <ExportButtons endpoint="/api/coach/exports?type=marketplace" filenamePrefix="coach-marketplace" label="Marketplace" showDateRange />
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
                <a href="#verification" className="block hover:text-[#b80f0a]">Verification</a>
                <a href="#security" className="block hover:text-[#b80f0a]">Security</a>
                <a href="#branding" className="block hover:text-[#b80f0a]">Branding</a>
                <a href="#policies" className="block hover:text-[#b80f0a]">Policies</a>
                <a href="#communication" className="block hover:text-[#b80f0a]">Communication</a>
                <a href="#notifications" className="block hover:text-[#b80f0a]">Notifications</a>
                <a href="#payouts" className="block hover:text-[#b80f0a]">Payouts</a>
                <a href="#plans" className="block hover:text-[#b80f0a]">Plans</a>
                {showAdvanced ? (
                  <>
                    <a href="#integrations" className="block hover:text-[#b80f0a]">Integrations</a>
                    <a href="#privacy" className="block hover:text-[#b80f0a]">Privacy</a>
                    <a href="#export-center" className="block hover:text-[#b80f0a]">Export center</a>
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
                <a href="#account" className="block hover:text-[#b80f0a]">Account controls</a>
              </nav>
            </div>
          </aside>
        </div>
      </div>
      <ManagePlanModal
        open={managePlanModalOpen}
        onClose={() => setManagePlanModalOpen(false)}
        role="coach"
        currentTier={coachTier}
        isSubscribed={Boolean(coachTier)}
        onPlanChanged={(tier) => setCoachTier(tier as FeeTier)}
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
      {recoveryModalOpen && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Recovery codes</p>
                <h2 className="text-lg font-semibold text-[#191919]">Save these codes</h2>
              </div>
              <button
                type="button"
                onClick={() => setRecoveryModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-3 text-xs text-[#4a4a4a]">
              Store these in a safe place. Each code can be used once if you lose access to your authenticator app.
            </p>
            <div className="mt-4 grid gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 font-mono text-xs text-[#191919]">
              {recoveryCodes.length > 0 ? recoveryCodes.map((code) => <span key={code}>{code}</span>) : <span>No codes generated.</span>}
            </div>
            {recoveryNotice && <p className="mt-2 text-xs text-[#b80f0a]">{recoveryNotice}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyRecoveryCodes}
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Copy codes
              </button>
              <button
                type="button"
                onClick={() => setRecoveryModalOpen(false)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {passkeyModalOpen && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Passkeys</p>
                <h2 className="text-lg font-semibold text-[#191919]">Manage passkeys</h2>
              </div>
              <button
                type="button"
                onClick={() => setPasskeyModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-xs text-[#4a4a4a]">
                <span className="text-xs font-semibold text-[#191919]">Add a device</span>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={passkeyName}
                    onChange={(event) => setPasskeyName(event.target.value)}
                    className="flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="e.g., MacBook Pro"
                  />
                  <button
                    type="button"
                    onClick={handleAddPasskey}
                    disabled={passkeySaving}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {passkeySaving ? 'Saving...' : 'Add'}
                  </button>
                </div>
              </label>
              {passkeyNotice && <p className="text-xs text-[#b80f0a]">{passkeyNotice}</p>}
              <div className="space-y-2">
                {passkeys.length === 0 ? (
                  <p className="text-xs text-[#4a4a4a]">No passkeys saved yet.</p>
                ) : (
                  passkeys.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-[#191919]">{item.label}</p>
                        <p className="text-[#4a4a4a]">Added {new Date(item.created_at).toLocaleDateString()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePasskey(item.id)}
                        className="text-xs font-semibold text-[#b80f0a]"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
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
    </main>
  )
}
