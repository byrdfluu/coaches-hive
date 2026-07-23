'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import RoleSwitcher from '@/components/RoleSwitcher'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { ORG_ATHLETE_LIMITS, ORG_COACH_LIMITS, ORG_FEATURES, formatTierName, normalizeOrgTier } from '@/lib/planRules'
import ShareLinkCard from '@/components/ShareLinkCard'
import { ORG_PLAN_PRICING } from '@/lib/orgPricing'
import Link from 'next/link'
import ExportButtons from '@/components/ExportButtons'
import { getOrgTypeConfig, ORG_TYPE_OPTIONS } from '@/lib/orgTypeConfig'
import ManagePlanModal from '@/components/ManagePlanModal'
import MobileSectionJumpNav from '@/components/MobileSectionJumpNav'

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const defaultPublicProfile = {
  mission: '',
  website_url: '',
  instagram_url: '',
  facebook_url: '',
  x_url: '',
  service_area: '',
  program_categories: '',
  ages_served: '',
  business_hours: '',
  registration_status: '',
}
const MAX_PUBLIC_GALLERY_IMAGES = 8

export default function OrgSettingsPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [settings, setSettings] = useState({
    org_name: '',
    org_type: '',
    primary_contact_email: '',
    support_phone: '',
    location: '',
    cancellation_window: '24 hours',
    reschedule_window: 'Up to 12 hours',
    policy_notes: '',
    org_refund_policy: '',
    billing_contact: '',
    invoice_frequency: 'Monthly',
    tax_id: '',
    billing_address: '',
    fee_reminder_policy: 'off',
    plan: 'standard',
    plan_status: 'trialing',
    guardian_consent: 'Required for minors',
    eligibility_tracking: 'Enabled',
    medical_clearance: 'Before first session',
    communication_limits: 'Coach ↔ Parent only',
    season_start: '',
    season_end: '',
    brand_logo_url: '',
    brand_cover_url: '',
    brand_primary_color: '#191919',
    brand_accent_color: '#b80f0a',
    stripe_account_id: '',
    compliance_checklist: {} as Record<string, boolean>,
    portal_preferences: {} as Record<string, unknown>,
  })
  const [publicProfile, setPublicProfile] = useState(defaultPublicProfile)
  const [publicGallery, setPublicGallery] = useState<string[]>([])
  const [galleryUploading, setGalleryUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [stripeStatus, setStripeStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [savedFlags, setSavedFlags] = useState({ settings: false })
  const [brandingUploading, setBrandingUploading] = useState(false)
  const [accountNotice, setAccountNotice] = useState('')
  const [cancelSubscriptionModalOpen, setCancelSubscriptionModalOpen] = useState(false)
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false)
  const [managePlanModalOpen, setManagePlanModalOpen] = useState(false)
  const [accountActionLoading, setAccountActionLoading] = useState<'cancel' | 'delete' | null>(null)
  const [coachCount, setCoachCount] = useState(0)
  const [athleteCount, setAthleteCount] = useState(0)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [complianceUploads, setComplianceUploads] = useState<Array<{ name: string; url: string; createdAt: string }>>([])
  const [complianceNotice, setComplianceNotice] = useState('')
  const [complianceUploading, setComplianceUploading] = useState(false)
  const [savedOrgSlug, setSavedOrgSlug] = useState('')

  // Locations state
  type OrgLocation = {
    id: string
    org_id: string
    name: string
    address: string | null
    city: string | null
    state: string | null
    is_primary: boolean
    created_at: string
  }
  const [locations, setLocations] = useState<OrgLocation[]>([])
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [newLocation, setNewLocation] = useState({ name: '', address: '', city: '', state: '', is_primary: false })
  const [addingLocation, setAddingLocation] = useState(false)
  const [showAddLocationForm, setShowAddLocationForm] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editLocationDraft, setEditLocationDraft] = useState<Partial<OrgLocation>>({})
  const [locationActioning, setLocationActioning] = useState<string | null>(null)

  // Age groups state
  type AgeGroup = { id: string; org_id: string; label: string; min_age: number | null; max_age: number | null; sort_order: number }
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([])
  const [ageGroupsLoading, setAgeGroupsLoading] = useState(true)
  const [newAgeGroup, setNewAgeGroup] = useState({ label: '', min_age: '', max_age: '' })
  const [addingAgeGroup, setAddingAgeGroup] = useState(false)
  const [ageGroupActioning, setAgeGroupActioning] = useState<string | null>(null)

  useEffect(() => {
    const syncAdvancedHash = () => {
      if (window.location.hash === '#export-center') {
        setShowAdvanced(true)
      }
    }
    syncAdvancedHash()
    window.addEventListener('hashchange', syncAdvancedHash)
    return () => window.removeEventListener('hashchange', syncAdvancedHash)
  }, [])

  const triggerSaved = () => {
    setSavedFlags({ settings: true })
    window.setTimeout(() => {
      setSavedFlags({ settings: false })
    }, 2000)
  }

  useEffect(() => {
    let active = true
    const loadSettings = async () => {
      const response = await fetch('/api/org/settings')
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      setSettings((prev) => ({ ...prev, ...(payload.settings || {}) }))
      setSavedOrgSlug(slugify(String(payload.settings?.org_name || '')))
    }
    loadSettings()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const portalPrefs = settings.portal_preferences as Record<string, unknown> | undefined
    const savedPublicProfile =
      portalPrefs && typeof portalPrefs.public_profile === 'object'
        ? (portalPrefs.public_profile as Record<string, unknown>)
        : {}

    setPublicProfile((prev) => ({
      ...prev,
      mission: savedPublicProfile.mission !== undefined ? String(savedPublicProfile.mission || '') : prev.mission,
      website_url: savedPublicProfile.website_url !== undefined ? String(savedPublicProfile.website_url || '') : prev.website_url,
      instagram_url: savedPublicProfile.instagram_url !== undefined ? String(savedPublicProfile.instagram_url || '') : prev.instagram_url,
      facebook_url: savedPublicProfile.facebook_url !== undefined ? String(savedPublicProfile.facebook_url || '') : prev.facebook_url,
      x_url: savedPublicProfile.x_url !== undefined ? String(savedPublicProfile.x_url || '') : prev.x_url,
      service_area: savedPublicProfile.service_area !== undefined ? String(savedPublicProfile.service_area || '') : prev.service_area,
      program_categories: savedPublicProfile.program_categories !== undefined ? String(savedPublicProfile.program_categories || '') : prev.program_categories,
      ages_served: savedPublicProfile.ages_served !== undefined ? String(savedPublicProfile.ages_served || '') : prev.ages_served,
      business_hours: savedPublicProfile.business_hours !== undefined ? String(savedPublicProfile.business_hours || '') : prev.business_hours,
      registration_status: savedPublicProfile.registration_status !== undefined ? String(savedPublicProfile.registration_status || '') : prev.registration_status,
    }))

    const savedGallery =
      portalPrefs && Array.isArray((portalPrefs as Record<string, unknown>).public_gallery)
        ? ((portalPrefs as Record<string, unknown>).public_gallery as unknown[])
            .map((item) => String(item || '').trim())
            .filter(Boolean)
        : []
    setPublicGallery(savedGallery)
  }, [settings.portal_preferences])

  useEffect(() => {
    let active = true
    const loadBilling = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle()
      const membershipRow = (membership || null) as { org_id?: string | null } | null
      if (!membershipRow?.org_id) return
      setOrgId(membershipRow.org_id)
      const { data: members } = await supabase
        .from('organization_memberships')
        .select('role')
        .eq('org_id', membershipRow.org_id)
      if (!active) return
      const memberRows = (members || []) as Array<{ role?: string | null }>
      const coaches = memberRows.filter((row) => ['coach', 'assistant_coach'].includes(String(row.role)))
      const athletes = memberRows.filter((row) => String(row.role) === 'athlete')
      setCoachCount(coaches.length)
      setAthleteCount(athletes.length)
    }
    loadBilling()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    let active = true
    const syncStripeStatus = async () => {
      const currentStripeId = String(settings.stripe_account_id || '').trim()
      if (!currentStripeId) {
        setStripeStatus('idle')
        return
      }
      setStripeStatus('connecting')
      const response = await fetch('/api/org/stripe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: currentStripeId }),
      })
      if (!active) return
      if (!response.ok) {
        setStripeStatus('error')
        return
      }
      const payload = await response.json().catch(() => null)
      if (!active) return
      setStripeStatus(payload?.connected ? 'connected' : 'idle')
      if (payload?.stripe_account_id && payload.stripe_account_id !== currentStripeId) {
        setSettings((prev) => ({ ...prev, stripe_account_id: payload.stripe_account_id }))
      }
    }
    syncStripeStatus()
    return () => {
      active = false
    }
  }, [settings.stripe_account_id])

  useEffect(() => {
    if (!orgId) return
    let active = true
    const loadComplianceUploads = async () => {
      const { data } = await supabase
        .from('org_compliance_uploads')
        .select('file_name, file_path, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (!active) return
      if (!data || data.length === 0) {
        setComplianceUploads([])
        return
      }
      const uploadRows = data as Array<{
        file_name?: string | null
        file_path: string
        created_at?: string | null
      }>
      const signed = await Promise.all(
        uploadRows.map(async (row) => {
          const { data: signedData } = await supabase.storage
            .from('attachments')
            .createSignedUrl(row.file_path, 60 * 60 * 24 * 7)
          return {
            name: row.file_name || 'Document',
            url: signedData?.signedUrl || '',
            createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : '',
          }
        })
      )
      setComplianceUploads(signed.filter((item) => item.url))
    }
    loadComplianceUploads()
    return () => {
      active = false
    }
  }, [orgId, supabase])

  const orgConfig = useMemo(() => getOrgTypeConfig(settings.org_type), [settings.org_type])
  const portalPreferences = useMemo(() => {
    return {
      ...orgConfig.modules,
      ...(settings.portal_preferences || {}),
    }
  }, [orgConfig.modules, settings.portal_preferences])
  const complianceChecklist = useMemo(() => orgConfig.compliance.checklist, [orgConfig.compliance.checklist])
  const complianceSelections = useMemo(() => settings.compliance_checklist || {}, [settings.compliance_checklist])
  const mobileJumpSections = [
    { href: '#profile', label: 'Profile' },
    { href: '#locations', label: 'Locations' },
    { href: '#age-groups', label: 'Age groups' },
    { href: '#branding', label: 'Branding' },
    { href: '#policies', label: 'Policies' },
    { href: '#requirements', label: 'Requirements' },
    ...(showAdvanced
      ? [
          ...(portalPreferences.compliance ? [{ href: '#compliance', label: 'Compliance' }] : []),
          { href: '#modules', label: 'Modules' },
          { href: '#billing', label: 'Billing' },
          { href: '#seasons', label: 'Seasons' },
          { href: '#payments', label: 'Payments' },
          { href: '#export-center', label: 'Export center' },
        ]
      : []),
    { href: '#account', label: 'Account controls' },
  ]

  const togglePortalPreference = (key: string) => {
    setSettings((prev) => {
      const config = getOrgTypeConfig(prev.org_type)
      const portalPrefs = (prev.portal_preferences || {}) as Record<string, unknown>
      const merged = {
        ...config.modules,
        ...portalPrefs,
      }
      return {
        ...prev,
        portal_preferences: {
          ...portalPrefs,
          [key]: !Boolean(merged[key]),
        },
      }
    })
  }

  // Load locations
  useEffect(() => {
    let active = true
    const loadLocations = async () => {
      setLocationsLoading(true)
      try {
        const res = await fetch('/api/org/locations')
        if (!res.ok) return
        const payload = await res.json()
        if (!active) return
        setLocations(payload.locations ?? [])
      } finally {
        if (active) setLocationsLoading(false)
      }
    }
    loadLocations()
    return () => { active = false }
  }, [])

  // Load age groups
  useEffect(() => {
    let active = true
    const loadAgeGroups = async () => {
      setAgeGroupsLoading(true)
      try {
        const res = await fetch('/api/org/age-groups')
        if (!res.ok) return
        const payload = await res.json()
        if (!active) return
        setAgeGroups(payload.age_groups ?? [])
      } finally {
        if (active) setAgeGroupsLoading(false)
      }
    }
    loadAgeGroups()
    return () => { active = false }
  }, [])

  const handleAddLocation = async () => {
    if (!newLocation.name.trim() || addingLocation) return
    setAddingLocation(true)
    try {
      const res = await fetch('/api/org/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLocation),
      })
      const payload = await res.json()
      if (!res.ok) {
        setToast(payload.error || 'Failed to add location')
        return
      }
      if (newLocation.is_primary) {
        setLocations((prev) => [payload.location, ...prev.map((l) => ({ ...l, is_primary: false }))])
      } else {
        setLocations((prev) => [...prev, payload.location])
      }
      setNewLocation({ name: '', address: '', city: '', state: '', is_primary: false })
      setShowAddLocationForm(false)
      setToast('Location added')
    } finally {
      setAddingLocation(false)
    }
  }

  const handleSaveLocationEdit = async (id: string) => {
    if (locationActioning) return
    setLocationActioning(id)
    try {
      const res = await fetch(`/api/org/locations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editLocationDraft),
      })
      const payload = await res.json()
      if (!res.ok) {
        setToast(payload.error || 'Failed to update location')
        return
      }
      const updated = payload.location
      if (editLocationDraft.is_primary) {
        setLocations((prev) => prev.map((l) => l.id === id ? updated : { ...l, is_primary: false }))
      } else {
        setLocations((prev) => prev.map((l) => l.id === id ? updated : l))
      }
      setEditingLocationId(null)
      setEditLocationDraft({})
      setToast('Location updated')
    } finally {
      setLocationActioning(null)
    }
  }

  const handleDeleteLocation = async (id: string) => {
    if (locationActioning) return
    setLocationActioning(id)
    try {
      const res = await fetch(`/api/org/locations/${id}`, { method: 'DELETE' })
      const payload = await res.json()
      if (!res.ok) {
        setToast(payload.error || 'Failed to delete location')
        return
      }
      setLocations((prev) => prev.filter((l) => l.id !== id))
      setToast('Location deleted')
    } finally {
      setLocationActioning(null)
    }
  }

  const handleAddAgeGroup = async () => {
    if (!newAgeGroup.label.trim() || addingAgeGroup) return
    setAddingAgeGroup(true)
    try {
      const res = await fetch('/api/org/age-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newAgeGroup.label.trim(),
          min_age: newAgeGroup.min_age !== '' ? Number(newAgeGroup.min_age) : null,
          max_age: newAgeGroup.max_age !== '' ? Number(newAgeGroup.max_age) : null,
        }),
      })
      const payload = await res.json()
      if (!res.ok) { setToast(payload.error || 'Failed to add age group'); return }
      setAgeGroups((prev) => [...prev, payload.age_group])
      setNewAgeGroup({ label: '', min_age: '', max_age: '' })
      setToast('Age group added')
    } finally {
      setAddingAgeGroup(false)
    }
  }

  const handleDeleteAgeGroup = async (id: string) => {
    if (ageGroupActioning) return
    setAgeGroupActioning(id)
    try {
      const res = await fetch(`/api/org/age-groups/${id}`, { method: 'DELETE' })
      const payload = await res.json()
      if (!res.ok) { setToast(payload.error || 'Failed to delete age group'); return }
      setAgeGroups((prev) => prev.filter((g) => g.id !== id))
      setToast('Age group deleted')
    } finally {
      setAgeGroupActioning(null)
    }
  }

  const handleAddAgeGroupPreset = async (label: string) => {
    if (ageGroups.some((g) => g.label === label)) return
    const res = await fetch('/api/org/age-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    const payload = await res.json()
    if (!res.ok) { setToast(payload.error || 'Failed to add preset'); return }
    setAgeGroups((prev) => [...prev, payload.age_group])
  }

  const handleChange = (field: keyof typeof settings) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSettings((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handlePublicProfileChange =
    (field: keyof typeof defaultPublicProfile) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setPublicProfile((prev) => ({ ...prev, [field]: event.target.value }))
    }

  const handleBrandingUpload = async (slot: 'logo' | 'cover', event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBrandingUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('scope', 'org')
    formData.append('slot', slot)
    const response = await fetch('/api/storage/branding', {
      method: 'POST',
      body: formData,
    })
    if (response.ok) {
      const data = await response.json()
      setSettings((prev) => ({
        ...prev,
        brand_logo_url: slot === 'logo' ? data.url : prev.brand_logo_url,
        brand_cover_url: slot === 'cover' ? data.url : prev.brand_cover_url,
      }))
    }
    setBrandingUploading(false)
    event.target.value = ''
  }

  const handleGalleryUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (publicGallery.length >= MAX_PUBLIC_GALLERY_IMAGES) {
      setToast(`Gallery limit reached (${MAX_PUBLIC_GALLERY_IMAGES} images).`)
      event.target.value = ''
      return
    }
    setGalleryUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('scope', 'org')
    formData.append('slot', 'gallery')
    const response = await fetch('/api/storage/branding', {
      method: 'POST',
      body: formData,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.url) {
      setToast(payload?.error || 'Unable to upload gallery image.')
      setGalleryUploading(false)
      event.target.value = ''
      return
    }
    setPublicGallery((prev) => [...prev, String(payload.url)])
    setToast('Gallery image uploaded. Save settings to publish.')
    setGalleryUploading(false)
    event.target.value = ''
  }

  const handleRemoveGalleryImage = (index: number) => {
    setPublicGallery((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
  }

  const moveGalleryImage = (index: number, direction: 'left' | 'right') => {
    setPublicGallery((prev) => {
      const next = [...prev]
      const targetIndex = direction === 'left' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= next.length) return prev
      const temp = next[index]
      next[index] = next[targetIndex]
      next[targetIndex] = temp
      return next
    })
  }

  const orgTier = normalizeOrgTier(settings.plan)
  const tierLabel = formatTierName(orgTier)
  const statusLabel = formatTierName(settings.plan_status)
  const coachLimit = ORG_COACH_LIMITS[orgTier]
  const athleteLimit = ORG_ATHLETE_LIMITS[orgTier]
  const stripeAccountId = String(settings.stripe_account_id || '').trim()
  const hasStripeAccount = Boolean(stripeAccountId)
  const stripeVerificationRequired = hasStripeAccount && stripeStatus !== 'connected'
  const stripeStatusLabel = stripeStatus === 'connected'
    ? 'Connected'
    : stripeStatus === 'error'
      ? 'Needs attention'
      : hasStripeAccount
        ? 'Pending verification'
        : 'Not connected'
  const stripeStatusClasses = stripeStatusLabel === 'Connected'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : stripeStatusLabel === 'Needs attention'
      ? 'border-[#f5c2c2] bg-[#fff5f5] text-[#b80f0a]'
      : 'border-[#dcdcdc] bg-[#f5f5f5] text-[#4a4a4a]'
  const maskedStripeAccountId = stripeAccountId
    ? stripeAccountId.length > 12
      ? `${stripeAccountId.slice(0, 8)}••••${stripeAccountId.slice(-4)}`
      : stripeAccountId
    : 'No Stripe account yet'
  const formatLimit = (value: number | null) => (value === null ? 'Unlimited' : `Up to ${value}`)
  const orgSlug = slugify(settings.org_name || '')
  const profileSlug = savedOrgSlug || orgSlug
  const profileReady = Boolean(profileSlug)
  const profileHref = profileReady ? `/organizations/${profileSlug}` : null

  const handleComplianceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setComplianceUploading(true)
    setComplianceNotice('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('scope', 'org_compliance')
    const response = await fetch('/api/storage/attachment', {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      setComplianceNotice('Unable to upload document.')
      setComplianceUploading(false)
      return
    }
    const payload = await response.json()
    setComplianceUploads((prev) => [
      { name: payload.name, url: payload.url, createdAt: 'Just now' },
      ...prev,
    ])
    setComplianceUploading(false)
    event.target.value = ''
  }

  const handleSave = async (nextSettings?: typeof settings) => {
    setSaving(true)
    setNotice('')
    const basePayload = nextSettings || settings
    const requestPayload = {
      ...basePayload,
      portal_preferences: {
        ...(basePayload.portal_preferences || {}),
        public_profile: {
          ...defaultPublicProfile,
          ...publicProfile,
        },
        public_gallery: publicGallery,
      },
    }
    const response = await fetch('/api/org/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setNotice(payload?.error || 'Unable to save settings.')
    } else {
      setSavedOrgSlug(slugify(String(basePayload.org_name || '')))
      router.refresh()
      setNotice('Settings saved.')
      setToast('Save complete')
      triggerSaved()
    }
    setSaving(false)
  }

  const applyTemplate = async (template: { title: string; update: Partial<typeof settings> }) => {
    const next = { ...settings, ...template.update }
    setSettings(next)
    await handleSave(next)
    setToast(`Applied ${template.title}`)
  }

  const handleStripeConnect = async () => {
    setStripeStatus('connecting')
    try {
      const response = await fetch('/api/org/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId || undefined }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        setStripeStatus('error')
        setToast(payload?.error || 'Unable to start Stripe onboarding.')
        return
      }
      if (payload?.stripe_account_id) {
        setSettings((prev) => ({ ...prev, stripe_account_id: payload.stripe_account_id }))
      }
      setStripeStatus('idle')
      window.open(payload.url, '_blank', 'noopener,noreferrer')
    } catch {
      setStripeStatus('error')
      setToast('Unable to start Stripe onboarding.')
    }
  }

  const handleStripeVerify = async () => {
    if (!settings.stripe_account_id) {
      setToast('Connect Stripe first.')
      return
    }
    setStripeStatus('connecting')
    const response = await fetch('/api/org/stripe/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: settings.stripe_account_id }),
    })
    if (!response.ok) {
      setStripeStatus('error')
      setToast('Stripe account could not be verified.')
      return
    }
    const payload = await response.json()
    setSettings((prev) => ({ ...prev, stripe_account_id: payload.stripe_account_id || prev.stripe_account_id }))
    setStripeStatus(payload?.connected ? 'connected' : 'idle')
    setToast(payload?.connected ? 'Stripe connected.' : 'Stripe account verified.')
  }

  const handleBillingPortal = async () => {
    const response = await fetch('/api/org/stripe/login-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId || undefined }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.url) {
      setToast(payload?.error || 'Stripe is not connected yet.')
      return
    }
    window.open(payload.url, '_blank', 'noopener,noreferrer')
  }

  const handleOpenCustomerPortal = async () => {
    const response = await fetch('/api/stripe/customer-portal', { method: 'POST' })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.url) {
      setToast(data?.error || 'Unable to open billing portal.')
      return
    }
    window.open(data.url, '_blank', 'noopener,noreferrer')
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
    window.location.assign('/org?billing=cancel_scheduled')
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

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Settings</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Update org preferences, policies, and billing contacts.</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <RoleSwitcher />
            <div className="flex flex-wrap items-center gap-2">
              {profileHref ? (
                <Link
                  href={profileHref}
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold !text-[#191919] visited:!text-[#191919] transition-colors hover:!text-[#b80f0a]"
                >
                  Go to profile
                </Link>
              ) : (
                <button
                  type="button"
                  className="rounded-full border border-[#dcdcdc] px-4 py-2 text-sm font-semibold text-[#9a9a9a]"
                  disabled
                >
                  Go to profile
                </button>
              )}
              <button
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => handleSave()}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save settings'}
              </button>
              {savedFlags.settings && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Saved
                </span>
              )}
            </div>
          </div>
        </header>
        {notice ? (
          <p className="mt-3 text-sm text-[#4a4a4a]">{notice}</p>
        ) : null}

        <div className="lg:hidden">
          <OrgSidebar />
        </div>
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_220px]">
          <div className="space-y-6">
            <MobileSectionJumpNav
              sections={mobileJumpSections}
              actionLabel={showAdvanced ? undefined : 'Show advanced'}
              onAction={showAdvanced ? undefined : () => setShowAdvanced(true)}
            />
            {profileSlug && (
              <section className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Org link</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">Share this link with athletes and coaches to join your organization.</p>
                <div className="mt-4">
                  <ShareLinkCard path={`/organizations/${profileSlug}`} description="Share with athletes and coaches to join your organization." />
                </div>
              </section>
            )}
            <section id="profile" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#191919]">Org profile</h2>
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save profile'}
                </button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Organization name</span>
                  <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.org_name} onChange={handleChange('org_name')} placeholder="Metro Volleyball Club" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Organization type</span>
                  <select className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.org_type} onChange={handleChange('org_type')}>
                    <option value="">Select type</option>
                    {ORG_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Primary contact email</span>
                  <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.primary_contact_email} onChange={handleChange('primary_contact_email')} placeholder="ops@club.com" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Support phone</span>
                  <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.support_phone} onChange={handleChange('support_phone')} placeholder="+1 (555) 200-3000" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Primary location</span>
                  <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.location} onChange={handleChange('location')} placeholder="Austin, TX" />
                </label>
                <label className="md:col-span-2 space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Short description / mission</span>
                  <textarea
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    rows={3}
                    value={publicProfile.mission}
                    onChange={handlePublicProfileChange('mission')}
                    placeholder="Mission and purpose shown on your public org profile."
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Website</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={publicProfile.website_url}
                    onChange={handlePublicProfileChange('website_url')}
                    placeholder="https://yourorg.com"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Instagram</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={publicProfile.instagram_url}
                    onChange={handlePublicProfileChange('instagram_url')}
                    placeholder="https://instagram.com/yourorg"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Facebook</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={publicProfile.facebook_url}
                    onChange={handlePublicProfileChange('facebook_url')}
                    placeholder="https://facebook.com/yourorg"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">X (Twitter)</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={publicProfile.x_url}
                    onChange={handlePublicProfileChange('x_url')}
                    placeholder="https://x.com/yourorg"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Service area</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={publicProfile.service_area}
                    onChange={handlePublicProfileChange('service_area')}
                    placeholder="Local / Regional / National"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Sports / program categories</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={publicProfile.program_categories}
                    onChange={handlePublicProfileChange('program_categories')}
                    placeholder="Soccer, Basketball, Strength, Conditioning"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Ages served</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={publicProfile.ages_served}
                    onChange={handlePublicProfileChange('ages_served')}
                    placeholder="8-10, 11-13, 14-18"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Operating season start</span>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={settings.season_start}
                    onChange={handleChange('season_start')}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Operating season end</span>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={settings.season_end}
                    onChange={handleChange('season_end')}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Business hours</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={publicProfile.business_hours}
                    onChange={handlePublicProfileChange('business_hours')}
                    placeholder="Mon-Fri 9AM-6PM ET"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Registration status</span>
                  <select
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={publicProfile.registration_status}
                    onChange={handlePublicProfileChange('registration_status')}
                  >
                    <option value="">Select status</option>
                    <option value="Open">Open</option>
                    <option value="Waitlist">Waitlist</option>
                    <option value="Closed">Closed</option>
                  </select>
                </label>
                <div className="md:col-span-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                  Public contact CTA will route users to Coaches Hive messaging.
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[#4a4a4a]">
                      Public gallery ({publicGallery.length}/{MAX_PUBLIC_GALLERY_IMAGES})
                    </span>
                    <label className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919] transition-colors hover:text-[#b80f0a]">
                      {galleryUploading ? 'Uploading...' : 'Add image'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleGalleryUpload}
                        disabled={galleryUploading || publicGallery.length >= MAX_PUBLIC_GALLERY_IMAGES}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-[#4a4a4a]">
                    Add up to {MAX_PUBLIC_GALLERY_IMAGES} images for your public profile. Save settings to publish changes.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {publicGallery.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
                        No gallery images yet.
                      </div>
                    ) : (
                      publicGallery.map((imageUrl, index) => (
                        <div key={`${imageUrl}-${index}`} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-2">
                          <div
                            className="h-24 w-full rounded-xl border border-[#dcdcdc] bg-white bg-cover bg-center"
                            style={{ backgroundImage: `url(${imageUrl})` }}
                          />
                          <div className="mt-2 flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => moveGalleryImage(index, 'left')}
                              disabled={index === 0}
                              className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] font-semibold text-[#191919] disabled:opacity-40"
                            >
                              Left
                            </button>
                            <button
                              type="button"
                              onClick={() => moveGalleryImage(index, 'right')}
                              disabled={index === publicGallery.length - 1}
                              className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] font-semibold text-[#191919] disabled:opacity-40"
                            >
                              Right
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveGalleryImage(index)}
                              className="rounded-full border border-[#b80f0a] px-2 py-1 text-[11px] font-semibold text-[#b80f0a]"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Locations Management Section */}
            <section id="locations" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Locations</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Manage your organization&apos;s physical locations and facilities.</p>
                </div>
                {!showAddLocationForm && (
                  <button
                    type="button"
                    onClick={() => setShowAddLocationForm(true)}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add location
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {locationsLoading ? (
                  <p className="text-sm text-[#9b9b9b]">Loading locations…</p>
                ) : locations.length === 0 ? (
                  <p className="text-sm text-[#9b9b9b]">No locations yet. Add your first location.</p>
                ) : (
                  locations.map((loc) => (
                    <div key={loc.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-4">
                      {editingLocationId === loc.id ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-[#4a4a4a]">Name *</span>
                              <input
                                type="text"
                                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                                value={editLocationDraft.name ?? loc.name}
                                onChange={(e) => setEditLocationDraft((prev) => ({ ...prev, name: e.target.value }))}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-[#4a4a4a]">Address</span>
                              <input
                                type="text"
                                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                                value={editLocationDraft.address ?? loc.address ?? ''}
                                onChange={(e) => setEditLocationDraft((prev) => ({ ...prev, address: e.target.value }))}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-[#4a4a4a]">City</span>
                              <input
                                type="text"
                                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                                value={editLocationDraft.city ?? loc.city ?? ''}
                                onChange={(e) => setEditLocationDraft((prev) => ({ ...prev, city: e.target.value }))}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-[#4a4a4a]">State</span>
                              <input
                                type="text"
                                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                                placeholder="TX"
                                value={editLocationDraft.state ?? loc.state ?? ''}
                                onChange={(e) => setEditLocationDraft((prev) => ({ ...prev, state: e.target.value }))}
                              />
                            </label>
                          </div>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={editLocationDraft.is_primary ?? loc.is_primary}
                              onChange={(e) => setEditLocationDraft((prev) => ({ ...prev, is_primary: e.target.checked }))}
                            />
                            <span className="text-xs font-semibold text-[#4a4a4a]">Primary location</span>
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={locationActioning === loc.id}
                              onClick={() => handleSaveLocationEdit(loc.id)}
                              className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {locationActioning === loc.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingLocationId(null); setEditLocationDraft({}) }}
                              className="text-sm text-[#9b9b9b] hover:text-[#191919]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-[#191919]">{loc.name}</p>
                              {loc.is_primary && (
                                <span className="rounded-full border border-[#b80f0a] bg-red-50 px-2 py-0.5 text-xs font-semibold text-[#b80f0a]">
                                  Primary
                                </span>
                              )}
                            </div>
                            {(loc.city || loc.state || loc.address) && (
                              <p className="mt-0.5 text-xs text-[#6b5f55]">
                                {[loc.address, loc.city, loc.state].filter(Boolean).join(', ')}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLocationId(loc.id)
                                setEditLocationDraft({ name: loc.name, address: loc.address ?? '', city: loc.city ?? '', state: loc.state ?? '', is_primary: loc.is_primary })
                              }}
                              className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#4a4a4a] hover:border-[#191919]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={locationActioning === loc.id}
                              onClick={() => handleDeleteLocation(loc.id)}
                              className="text-xs font-semibold text-[#9b9b9b] underline hover:text-[#b80f0a] disabled:opacity-50"
                            >
                              {locationActioning === loc.id ? '...' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {showAddLocationForm && (
                <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <p className="mb-3 text-sm font-semibold text-[#191919]">New location</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Name *</span>
                      <input
                        type="text"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                        placeholder="Main Facility"
                        value={newLocation.name}
                        onChange={(e) => setNewLocation((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Address</span>
                      <input
                        type="text"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                        placeholder="123 Main St"
                        value={newLocation.address}
                        onChange={(e) => setNewLocation((prev) => ({ ...prev, address: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#4a4a4a]">City</span>
                      <input
                        type="text"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                        placeholder="Austin"
                        value={newLocation.city}
                        onChange={(e) => setNewLocation((prev) => ({ ...prev, city: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#4a4a4a]">State</span>
                      <input
                        type="text"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                        placeholder="TX"
                        value={newLocation.state}
                        onChange={(e) => setNewLocation((prev) => ({ ...prev, state: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newLocation.is_primary}
                      onChange={(e) => setNewLocation((prev) => ({ ...prev, is_primary: e.target.checked }))}
                    />
                    <span className="text-xs font-semibold text-[#4a4a4a]">Primary location</span>
                  </label>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!newLocation.name.trim() || addingLocation}
                      onClick={handleAddLocation}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {addingLocation ? 'Adding...' : 'Add location'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddLocationForm(false); setNewLocation({ name: '', address: '', city: '', state: '', is_primary: false }) }}
                      className="text-sm text-[#9b9b9b] hover:text-[#191919]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Age Groups Section */}
            <section id="age-groups" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-[#191919]">Age groups</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">Define age divisions for your org (e.g. U12, U14 Boys). Used when creating teams.</p>
              </div>

              {/* Quick-add presets */}
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-[#9b9b9b]">Quick add</p>
                <div className="flex flex-wrap gap-2">
                  {['6U','8U','10U','12U','14U','16U','18U'].map((label) => {
                    const exists = ageGroups.some((g) => g.label === label)
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={exists}
                        onClick={() => handleAddAgeGroupPreset(label)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${exists ? 'border-[#dcdcdc] bg-[#f5f5f5] text-[#9b9b9b] cursor-default' : 'border-[#191919] text-[#191919] hover:bg-[#191919] hover:text-white'}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Existing groups */}
              {ageGroupsLoading ? (
                <p className="text-sm text-[#9b9b9b]">Loading...</p>
              ) : ageGroups.length === 0 ? (
                <p className="text-sm text-[#9b9b9b]">No age groups yet.</p>
              ) : (
                <div className="mb-4 space-y-2">
                  {ageGroups.map((group) => (
                    <div key={group.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#dcdcdc] bg-[#f9f9f9] px-3 py-2">
                      <div>
                        <span className="text-sm font-semibold text-[#191919]">{group.label}</span>
                        {(group.min_age !== null || group.max_age !== null) && (
                          <span className="ml-2 text-xs text-[#9b9b9b]">
                            {group.min_age !== null && group.max_age !== null
                              ? `Ages ${group.min_age}–${group.max_age}`
                              : group.min_age !== null
                                ? `Ages ${group.min_age}+`
                                : `Up to age ${group.max_age}`}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={ageGroupActioning === group.id}
                        onClick={() => handleDeleteAgeGroup(group.id)}
                        className="text-xs text-[#b80f0a] disabled:opacity-50"
                      >
                        {ageGroupActioning === group.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new */}
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Label</label>
                  <input
                    className="rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm w-28"
                    placeholder="U14 Boys"
                    value={newAgeGroup.label}
                    onChange={(e) => setNewAgeGroup((p) => ({ ...p, label: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Min age</label>
                  <input
                    type="number"
                    min={0}
                    className="rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm w-20"
                    placeholder="—"
                    value={newAgeGroup.min_age}
                    onChange={(e) => setNewAgeGroup((p) => ({ ...p, min_age: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Max age</label>
                  <input
                    type="number"
                    min={0}
                    className="rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm w-20"
                    placeholder="—"
                    value={newAgeGroup.max_age}
                    onChange={(e) => setNewAgeGroup((p) => ({ ...p, max_age: e.target.value }))}
                  />
                </div>
                <button
                  type="button"
                  disabled={!newAgeGroup.label.trim() || addingAgeGroup}
                  onClick={handleAddAgeGroup}
                  className="rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {addingAgeGroup ? 'Adding...' : 'Add age group'}
                </button>
              </div>
            </section>

            <section id="branding" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Branding</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Upload logos, covers, and set org colors.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSave()}
                    disabled={saving}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save branding'}
                  </button>
                  {brandingUploading ? (
                    <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">Uploading...</span>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-xs font-semibold text-[#4a4a4a]">Current logo</p>
                  <div className="mt-3 flex items-center gap-4">
                    <div
                      className="h-14 w-14 rounded-full border border-[#191919] bg-white bg-cover bg-center"
                      style={{ backgroundImage: settings.brand_logo_url ? `url(${settings.brand_logo_url})` : 'none' }}
                    />
                    <label className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]">
                      Upload logo
                      <input type="file" className="hidden" onChange={(event) => handleBrandingUpload('logo', event)} />
                    </label>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-xs font-semibold text-[#4a4a4a]">Cover image</p>
                  <div
                    className="mt-3 h-24 rounded-2xl border border-[#dcdcdc] bg-white bg-cover bg-center"
                    style={{ backgroundImage: settings.brand_cover_url ? `url(${settings.brand_cover_url})` : 'none' }}
                  />
                  <label className="mt-3 inline-flex rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]">
                    Upload cover
                    <input type="file" className="hidden" onChange={(event) => handleBrandingUpload('cover', event)} />
                  </label>
                </div>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Primary color</span>
                  <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.brand_primary_color} onChange={handleChange('brand_primary_color')} placeholder="#191919" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Accent color</span>
                  <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.brand_accent_color} onChange={handleChange('brand_accent_color')} placeholder="#b80f0a" />
                </label>
              </div>
            </section>

            <section id="policies" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#191919]">Policies</h2>
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save policies'}
                </button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Cancellation window</span>
                  <select className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.cancellation_window} onChange={handleChange('cancellation_window')}>
                    <option>24 hours</option>
                    <option>12 hours</option>
                    <option>48 hours</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Reschedule window</span>
                  <select className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.reschedule_window} onChange={handleChange('reschedule_window')}>
                    <option>Up to 12 hours</option>
                    <option>Up to 24 hours</option>
                    <option>Up to 48 hours</option>
                  </select>
                </label>
                <label className="md:col-span-2 space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Org policy notes</span>
                  <textarea className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" rows={3} placeholder="Policies shared with athletes and parents." value={settings.policy_notes} onChange={handleChange('policy_notes')} />
                </label>
                <label className="md:col-span-2 space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Refund policy</span>
                  <textarea
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    rows={3}
                    placeholder="Default refund policy for org products."
                    value={settings.org_refund_policy}
                    onChange={handleChange('org_refund_policy')}
                  />
                </label>
              </div>
            </section>

            <section id="requirements" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#191919]">{orgConfig.policies.title}</h2>
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save requirements'}
                </button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                {portalPreferences.waivers ? (
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">{orgConfig.policies.guardianLabel}</span>
                    <select className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.guardian_consent} onChange={handleChange('guardian_consent')}>
                      <option>Required for minors</option>
                      <option>Required for all athletes</option>
                      <option>Not required</option>
                    </select>
                  </label>
                ) : null}
                {portalPreferences.eligibility ? (
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">{orgConfig.policies.eligibilityLabel}</span>
                    <select className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.eligibility_tracking} onChange={handleChange('eligibility_tracking')}>
                      <option>Enabled</option>
                      <option>Disabled</option>
                    </select>
                  </label>
                ) : null}
                {portalPreferences.compliance ? (
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">{orgConfig.policies.medicalLabel}</span>
                    <select className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.medical_clearance} onChange={handleChange('medical_clearance')}>
                      <option>Before first session</option>
                      <option>Once per season</option>
                      <option>Not required</option>
                    </select>
                  </label>
                ) : null}
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">{orgConfig.policies.communicationLabel}</span>
                  <select className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.communication_limits} onChange={handleChange('communication_limits')}>
                    <option>Coach ↔ Parent only</option>
                    <option>Coach ↔ Athlete + Parent</option>
                  </select>
                </label>
                <label className="md:col-span-2 space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">{orgConfig.policies.seasonLabel}</span>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.season_start} onChange={handleChange('season_start')} placeholder={orgConfig.policies.seasonStartPlaceholder} />
                    <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.season_end} onChange={handleChange('season_end')} placeholder={orgConfig.policies.seasonEndPlaceholder} />
                  </div>
                </label>
              </div>
            </section>

            <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Advanced settings</p>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Compliance, billing, and portal configuration.</p>
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
                {portalPreferences.compliance ? (
                  <section id="compliance" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-[#191919]">{orgConfig.compliance.title}</h2>
                        <p className="mt-1 text-sm text-[#4a4a4a]">{orgConfig.compliance.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {saving ? 'Saving...' : 'Save compliance'}
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm">
                      {complianceChecklist.map((item) => (
                        <label key={item} className="flex items-start gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 border-[#191919]"
                            checked={Boolean(complianceSelections[item])}
                            onChange={() =>
                              setSettings((prev) => ({
                                ...prev,
                                compliance_checklist: {
                                  ...(prev.compliance_checklist || {}),
                                  [item]: !prev.compliance_checklist?.[item],
                                },
                              }))
                            }
                          />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-4">
                      <label className="inline-flex rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]">
                        {complianceUploading ? 'Uploading...' : 'Upload document'}
                        <input type="file" className="hidden" onChange={handleComplianceUpload} />
                      </label>
                      {complianceNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{complianceNotice}</p> : null}
                      <div className="mt-3 space-y-2 text-sm">
                        {complianceUploads.length === 0 ? (
                          <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#4a4a4a]">
                            No documents uploaded yet.
                          </div>
                        ) : (
                          complianceUploads.map((item) => (
                            <a
                              key={item.url}
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                            >
                              <span>{item.name}</span>
                              <span className="text-xs text-[#4a4a4a]">{item.createdAt}</span>
                            </a>
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                ) : null}

                <section id="modules" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[#191919]">Portal modules</h2>
                      <p className="mt-1 text-sm text-[#4a4a4a]">Show or hide modules based on your org type.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSave()}
                      disabled={saving}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {saving ? 'Saving...' : 'Save modules'}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    {[
                      { key: 'compliance', label: 'Compliance tracking' },
                      { key: 'eligibility', label: 'Eligibility tracking' },
                      { key: 'waivers', label: 'Waivers & consent' },
                      { key: 'travel', label: 'Travel logistics' },
                      { key: 'academics', label: 'Academics & eligibility' },
                    ].map((item) => (
                      <label key={item.key} className="flex items-start gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 border-[#191919]"
                          checked={Boolean(portalPreferences[item.key])}
                          onChange={() => togglePortalPreference(item.key)}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </section>

                <section id="billing" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[#191919]">Billing</h2>
                      <p className="mt-1 text-sm text-[#4a4a4a]">Plan, usage, and monthly charges.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setManagePlanModalOpen(true)}
                      className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Manage plans
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs font-semibold text-[#4a4a4a]">Plan</p>
                      <p className="mt-1 text-lg font-semibold text-[#191919]">Organization All Access</p>
                      <p className="text-xs text-[#4a4a4a]">Status: {statusLabel}</p>
                    </div>
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs font-semibold text-[#4a4a4a]">Base price</p>
                      <p className="mt-1 text-lg font-semibold text-[#191919]">$49/month · $490/year</p>
                      <p className="text-xs text-[#4a4a4a]">One active coach included</p>
                    </div>
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs font-semibold text-[#4a4a4a]">Additional coaches</p>
                      <p className="mt-1 text-sm font-semibold text-[#191919]">$19/month · $190/year each</p>
                      <p className="text-xs text-[#4a4a4a]">Unlimited athletes and administrative staff</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs font-semibold text-[#4a4a4a]">Active coaches</p>
                      <p className="mt-1 text-lg font-semibold text-[#191919]">{coachCount}</p>
                    </div>
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs font-semibold text-[#4a4a4a]">Active athletes</p>
                      <p className="mt-1 text-lg font-semibold text-[#191919]">{athleteCount}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-[#4a4a4a]">
                    Marketplace publishing: {ORG_FEATURES[orgTier].marketplacePublishing ? 'Included' : 'Not included'}
                  </div>
                  <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[#4a4a4a]">Stripe connection</p>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${stripeStatusClasses}`}>
                        {stripeStatusLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#4a4a4a]">
                      Account ID: <span className="font-semibold text-[#191919]">{maskedStripeAccountId}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleStripeConnect}
                        className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                      >
                        {hasStripeAccount ? 'Reconnect Stripe' : 'Connect Stripe'}
                      </button>
                      {stripeVerificationRequired ? (
                        <button
                          type="button"
                          onClick={handleStripeVerify}
                          disabled={stripeStatus === 'connecting'}
                          className="rounded-full border border-[#dcdcdc] px-4 py-2 text-xs font-semibold text-[#4a4a4a] disabled:opacity-60"
                        >
                          {stripeStatus === 'connecting' ? 'Checking...' : 'Continue verification'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#4a4a4a]">
                      {settings.stripe_account_id ? 'Stripe payouts account connected.' : 'No Stripe payouts account on file.'}
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenCustomerPortal}
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                    >
                      Manage billing
                    </button>
                    <button
                      type="button"
                      onClick={handleBillingPortal}
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                    >
                      Open Stripe payouts
                    </button>
                  </div>
                </section>

                <section id="seasons" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[#191919]">Seasons</h2>
                      <p className="mt-1 text-sm text-[#4a4a4a]">Set season dates and team templates.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSave()}
                      disabled={saving}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {saving ? 'Saving...' : 'Save seasons'}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Season start</span>
                      <input
                        type="date"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                        value={settings.season_start}
                        onChange={handleChange('season_start')}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Season end</span>
                      <input
                        type="date"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                        value={settings.season_end}
                        onChange={handleChange('season_end')}
                      />
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
                    {[
                      {
                        title: 'Varsity / JV bundle',
                        detail: 'Two teams, shared calendar, split rosters.',
                        update: {
                          season_start: settings.season_start || new Date().toISOString().slice(0, 10),
                          policy_notes: `${settings.policy_notes || ''}\nVarsity/JV bundle enabled.`.trim(),
                        },
                      },
                      {
                        title: 'Travel tournament squad',
                        detail: 'Travel dates + roster list prefilled.',
                        update: {
                          season_start: settings.season_start || new Date().toISOString().slice(0, 10),
                          policy_notes: `${settings.policy_notes || ''}\nTravel tournament schedule applied.`.trim(),
                        },
                      },
                      {
                        title: 'Club seasonal program',
                        detail: '12-week schedule with weekly sessions.',
                        update: {
                          season_start: settings.season_start || new Date().toISOString().slice(0, 10),
                          policy_notes: `${settings.policy_notes || ''}\nSeasonal program template applied.`.trim(),
                        },
                      },
                    ].map((template) => (
                      <div key={template.title} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="font-semibold text-[#191919]">{template.title}</p>
                        <p className="mt-1 text-xs text-[#4a4a4a]">{template.detail}</p>
                        <button
                          type="button"
                          onClick={() => applyTemplate(template)}
                          className="mt-3 rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                        >
                          Use template
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section id="payments" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-[#191919]">Payments</h2>
                    <button
                      type="button"
                      onClick={() => handleSave()}
                      disabled={saving}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {saving ? 'Saving...' : 'Save payments'}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Billing contact</span>
                      <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" placeholder="finance@club.com" value={settings.billing_contact} onChange={handleChange('billing_contact')} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Invoice frequency</span>
                      <select className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" value={settings.invoice_frequency} onChange={handleChange('invoice_frequency')}>
                        <option>Monthly</option>
                        <option>Quarterly</option>
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Tax ID</span>
                      <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" placeholder="EIN or VAT" value={settings.tax_id} onChange={handleChange('tax_id')} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Billing address</span>
                      <input className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2" placeholder="123 Main St" value={settings.billing_address} onChange={handleChange('billing_address')} />
                    </label>
                  </div>
                </section>

                <section id="export-center" className="glass-card scroll-mt-24 border border-[#191919] bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[#191919]">Export center</h2>
                      <p className="mt-1 text-sm text-[#4a4a4a]">Download roster, billing, compliance, and marketplace data from one place.</p>
                    </div>
                    <Link
                      href="/support"
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Contact support
                    </Link>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <ExportButtons endpoint="/api/org/exports?type=reports" filenamePrefix="org-summary" label="Summary reports" showDateRange />
                    <ExportButtons endpoint="/api/org/exports?type=roster" filenamePrefix="org-roster" label="Roster" />
                    <ExportButtons endpoint="/api/org/exports?type=fees" filenamePrefix="org-fees" label="Fees" showDateRange />
                    <ExportButtons endpoint="/api/org/exports?type=payments" filenamePrefix="org-payments" label="Payments" showDateRange />
                    <ExportButtons endpoint="/api/org/exports?type=invoices" filenamePrefix="org-invoices" label="Invoices" showDateRange />
                    <ExportButtons endpoint="/api/org/exports?type=compliance" filenamePrefix="org-compliance" label="Compliance" showDateRange />
                    <ExportButtons endpoint="/api/org/exports?type=marketplace" filenamePrefix="org-marketplace" label="Marketplace" showDateRange />
                  </div>
                </section>
              </>
            )}
            <section id="account" className="glass-card scroll-mt-24 border border-[#b80f0a] bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Account controls</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Cancel billing or permanently delete your profile.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCancelSubscriptionModalOpen(true)}
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                >
                  Cancel subscription
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteAccountModalOpen(true)}
                  className="rounded-full border border-[#b80f0a] px-4 py-2 text-sm font-semibold text-[#b80f0a]"
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
                <a href="#branding" className="block hover:text-[#b80f0a]">Branding</a>
                <a href="#policies" className="block hover:text-[#b80f0a]">Policies</a>
                <a href="#requirements" className="block hover:text-[#b80f0a]">Requirements</a>
                {showAdvanced ? (
                  <>
                    {portalPreferences.compliance ? (
                      <a href="#compliance" className="block hover:text-[#b80f0a]">Compliance</a>
                    ) : null}
                    <a href="#modules" className="block hover:text-[#b80f0a]">Modules</a>
                    <a href="#billing" className="block hover:text-[#b80f0a]">Billing</a>
                    <a href="#seasons" className="block hover:text-[#b80f0a]">Seasons</a>
                    <a href="#payments" className="block hover:text-[#b80f0a]">Payments</a>
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
        role="org_admin"
        currentTier={orgTier}
        isSubscribed={Boolean(orgTier)}
        onPlanChanged={(tier) => setSettings((prev) => ({ ...prev, plan: tier }))}
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
    </main>
  )
}
