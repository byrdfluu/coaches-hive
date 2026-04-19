'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { COACH_MARKETPLACE_ALLOWED, formatTierName, normalizeCoachTier } from '@/lib/planRules'

const types = [
  'Workout plan',
  'Meal plan',
  'Team gear',
  'Camp registration',
  'Clinic',
  'Membership',
  'Digital product',
  'Physical product',
  'Sponsorship',
  'Fundraiser',
  'Training plan',
  'Skills workshop',
  'Tryout fee',
  'Tournament entry',
  'Travel fee',
  'Equipment rental',
  'Facility rental',
  'Private lesson',
  'Donation',
  'Team photo package',
  'Uniform package',
]
const PRODUCT_MEDIA_BUCKET = 'product-media'
const DELIVERY_FILE_ACCEPT = '.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.mov,.m4v,.csv,video/*,application/pdf,application/zip'

const parsePrice = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

export default function CreateProductPage() {
  const supabase = createClientComponentClient()
  const previewMode = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_MARKETPLACE_PREVIEW === 'true'
  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [price, setPrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [discountLabel, setDiscountLabel] = useState('')
  const [priceLabel, setPriceLabel] = useState('')
  const [format, setFormat] = useState('digital')
  const [duration, setDuration] = useState('')
  const [nextAvailable, setNextAvailable] = useState('')
  const [includesText, setIncludesText] = useState('')
  const [refundPolicy, setRefundPolicy] = useState('')
  const [media, setMedia] = useState<File | null>(null)
  const [deliveryAsset, setDeliveryAsset] = useState<File | null>(null)
  const [deliveryExternalUrl, setDeliveryExternalUrl] = useState('')
  const [description, setDescription] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveIntent, setSaveIntent] = useState<'draft' | 'published' | null>(null)
  const [toast, setToast] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null)
  const [coachTier, setCoachTier] = useState<'starter' | 'pro' | 'elite'>('starter')
  const [planLoading, setPlanLoading] = useState(true)

  const uploadPrivateAttachment = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/storage/attachment', {
      method: 'POST',
      body: formData,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.path) {
      throw new Error(payload?.error || 'Unable to upload product file')
    }
    return payload as {
      path: string
      url: string
      name: string
      type: string
      size: number
    }
  }

  useEffect(() => {
    let mounted = true
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) {
        setCurrentUserId(data.user?.id ?? null)
      }
    }
    loadUser()
    return () => {
      mounted = false
    }
  }, [supabase])

  useEffect(() => {
    if (!currentUserId) return
    let mounted = true
    const loadStripeStatus = async () => {
      // Use server-side verify endpoint — client-side RLS may not expose stripe_account_id
      try {
        const res = await fetch('/api/stripe/connect/verify')
        if (!mounted) return
        if (res.ok) {
          const payload = await res.json().catch(() => null)
          setStripeConnected(Boolean(payload?.connected))
        } else {
          setStripeConnected(false)
        }
      } catch {
        if (mounted) setStripeConnected(false)
      }
    }
    loadStripeStatus()
    return () => {
      mounted = false
    }
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) {
      setPlanLoading(false)
      return
    }
    let mounted = true
    const loadTier = async () => {
      const { data } = await supabase
        .from('coach_plans')
        .select('tier')
        .eq('coach_id', currentUserId)
        .maybeSingle()
      const planRow = (data || null) as { tier?: string | null } | null
      if (!mounted) return
      if (planRow?.tier) {
        setCoachTier(normalizeCoachTier(planRow.tier))
      }
      setPlanLoading(false)
    }
    loadTier()
    return () => {
      mounted = false
    }
  }, [currentUserId, supabase])

  const handleSubmit = async (nextStatus: 'published' | 'draft') => {
    setNotice('')
    if (nextStatus === 'published' && !canPublish) {
      setNotice('Connect Stripe and upgrade your plan to publish products.')
      return
    }
    if (!currentUserId) {
      setNotice('You must be signed in to create a product.')
      return
    }
    if (!title.trim()) {
      setNotice('Add a title to continue.')
      return
    }
    if (nextStatus === 'published' && !type.trim()) {
      setNotice('Select a product type.')
      return
    }
    if (nextStatus === 'published' && !refundPolicy.trim()) {
      setNotice('Add a refund policy to continue.')
      return
    }
    const priceValue = parsePrice(price)
    const salePriceValue = salePrice ? parsePrice(salePrice) : null
    if (salePriceValue !== null && (priceValue === null || priceValue <= 0)) {
      setNotice('Enter a valid main price before adding a sale price.')
      return
    }
    if (salePriceValue !== null && priceValue !== null && salePriceValue >= priceValue) {
      setNotice('Sale price must be lower than the main price.')
      return
    }
    if (nextStatus === 'published') {
      if (priceValue === null || priceValue <= 0) {
        setNotice('Enter a valid price before publishing.')
        return
      }
      if (!String(format || '').trim()) {
        setNotice('Select a format before publishing.')
        return
      }
      if (!description.trim()) {
        setNotice('Add a description before publishing.')
        return
      }
      if (!media) {
        setNotice('Upload at least one image or video before publishing.')
        return
      }
      if (format === 'digital' && !deliveryAsset && !deliveryExternalUrl.trim()) {
        setNotice('Add a downloadable program file or a hosted video/link before publishing a digital product.')
        return
      }
    }

    setSaving(true)
    setSaveIntent(nextStatus)

    let mediaPath: string | null = null
    let uploadedDeliveryAsset: {
      path: string
      name: string
      type: string
      size: number
    } | null = null

    if (media) {
      const extension = media.name.split('.').pop()
      const safeName = media.name.replace(/[^a-zA-Z0-9._-]/g, '')
      const filePath = `${currentUserId}/${Date.now()}-${safeName || 'media'}.${extension || 'file'}`
      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_MEDIA_BUCKET)
        .upload(filePath, media, { upsert: true })

      if (uploadError) {
        setNotice('Upload failed. Make sure the product-media bucket exists and is public.')
        setSaving(false)
        setSaveIntent(null)
        return
      }

      mediaPath = filePath
    }

    if (deliveryAsset) {
      try {
        uploadedDeliveryAsset = await uploadPrivateAttachment(deliveryAsset)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Unable to upload product file.')
        setSaving(false)
        setSaveIntent(null)
        return
      }
    }

    const response = await fetch('/api/coach/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        category: type.trim() || null,
        type: type.trim() || null,
        status: nextStatus,
        price: priceValue,
        sale_price: salePriceValue,
        discount_label: discountLabel.trim() || null,
        price_label: priceLabel.trim() || null,
        format,
        duration: duration.trim() || null,
        next_available: nextAvailable ? new Date(nextAvailable).toISOString() : null,
        includes: includesText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        refund_policy: refundPolicy.trim() || null,
        description: description.trim() || null,
        media_url: mediaPath,
        delivery_asset_path: uploadedDeliveryAsset?.path || null,
        delivery_asset_name: uploadedDeliveryAsset?.name || null,
        delivery_asset_type: uploadedDeliveryAsset?.type || null,
        delivery_asset_size: uploadedDeliveryAsset?.size || null,
        delivery_external_url: deliveryExternalUrl.trim() || null,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setNotice(data?.error || 'Unable to save product. Check your products table columns.')
      setSaving(false)
      setSaveIntent(null)
      return
    }

    setTitle('')
    setPrice('')
    setSalePrice('')
    setDiscountLabel('')
    setPriceLabel('')
    setFormat('digital')
    setDuration('')
    setNextAvailable('')
    setIncludesText('')
    setRefundPolicy('')
    setDescription('')
    setMedia(null)
    setDeliveryAsset(null)
    setDeliveryExternalUrl('')
    setType('')
    setNotice(nextStatus === 'draft' ? 'Draft saved.' : 'Product published.')
    setToast('Save complete')
    setSaving(false)
    setSaveIntent(null)
  }

  const marketplaceAllowed = COACH_MARKETPLACE_ALLOWED[coachTier]
  const canPublish = previewMode || Boolean(stripeConnected && marketplaceAllowed)

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="glass-card border border-[#191919] bg-white p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Create product</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Publish or save as draft</h1>
              </div>
              <Link href="/coach/marketplace" className="text-sm font-semibold text-[#b80f0a]">Back to marketplace</Link>
            </div>

            <div className="mt-6 space-y-3">
              {previewMode && (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                  <p className="font-semibold text-[#191919]">Preview mode enabled</p>
                  <p className="mt-2">
                    Stripe and plan checks are bypassed so you can preview the marketplace UI. Connect Stripe and upgrade
                    plans before going live.
                  </p>
                </div>
              )}
              {stripeConnected === null && (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                  Checking Stripe connection...
                </div>
              )}
              {stripeConnected === false && !previewMode && (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                  <p className="font-semibold text-[#191919]">Connect Stripe to create products</p>
                  <p className="mt-2">You need a Stripe Connect account before publishing items.</p>
                  <Link
                    href="/coach/settings"
                    className="mt-4 inline-flex rounded-full border border-[#b80f0a] px-4 py-2 text-sm font-semibold text-[#b80f0a]"
                  >
                    Set up Stripe
                  </Link>
                </div>
              )}
              {planLoading && (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                  Checking plan access...
                </div>
              )}
              {!planLoading && !marketplaceAllowed && !previewMode && (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                  <p className="font-semibold text-[#191919]">Upgrade required for marketplace listings</p>
                  <p className="mt-2">
                    Your current plan is {formatTierName(coachTier)}. Upgrade to Pro or Elite to publish products and
                    subscriptions.
                  </p>
                  <Link
                    href="/pricing"
                    className="mt-4 inline-flex rounded-full border border-[#b80f0a] px-4 py-2 text-sm font-semibold text-[#b80f0a]"
                  >
                    View plans
                  </Link>
                </div>
              )}
            </div>

            <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#191919]">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  placeholder="Product title"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#191919]">Type *</label>
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {types.map((t) => {
                    const selected = type === t
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setType(t)}
                        className={`flex min-h-[56px] items-center justify-between rounded-2xl border px-4 py-3 text-left font-semibold transition ${
                          selected ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                        }`}
                      >
                        <span className="pr-3 leading-snug">{t}</span>
                        {selected ? <span className="text-[#b80f0a]">✓</span> : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Price *</label>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="$120"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Sale price (optional)</label>
                  <input
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="$99"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Discount label</label>
                  <input
                    value={discountLabel}
                    onChange={(e) => setDiscountLabel(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="10% off, Early bird"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Price label</label>
                  <input
                    value={priceLabel}
                    onChange={(e) => setPriceLabel(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="per session, per seat"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Format *</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  >
                    <option value="digital">Digital</option>
                    <option value="session">Session</option>
                    <option value="physical">Physical</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Duration or quantity</label>
                  <input
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="4-week plan, 60 min"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Next available</label>
                  <input
                    type="datetime-local"
                    value={nextAvailable}
                    onChange={(e) => setNextAvailable(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#191919]">What’s included</label>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  placeholder="Warm-up library, Video breakdowns, Weekly check-ins"
                  value={includesText}
                  onChange={(e) => setIncludesText(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#191919]">Refund policy *</label>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  placeholder="Leave blank to use your coach policy."
                  value={refundPolicy}
                  onChange={(e) => setRefundPolicy(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#191919]">Upload media (image or video) *</label>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setMedia(e.target.files?.[0] || null)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                />
                {media && <p className="text-xs text-[#4a4a4a]">Selected: {media.name}</p>}
              </div>

              <div className="space-y-3 rounded-2xl border border-[#dcdcdc] bg-[#f8f8f8] p-4">
                <div>
                  <label className="text-sm font-semibold text-[#191919]">Program delivery</label>
                  <p className="mt-1 text-xs text-[#4a4a4a]">
                    For digital products, upload the actual program file athletes should receive after purchase. Videos can be uploaded as MP4/MOV files or linked from YouTube, Vimeo, Loom, or another hosted page.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Upload program file</label>
                  <input
                    type="file"
                    accept={DELIVERY_FILE_ACCEPT}
                    onChange={(e) => setDeliveryAsset(e.target.files?.[0] || null)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  />
                  {deliveryAsset ? <p className="text-xs text-[#4a4a4a]">Selected: {deliveryAsset.name}</p> : null}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Hosted video or delivery link</label>
                  <input
                    value={deliveryExternalUrl}
                    onChange={(e) => setDeliveryExternalUrl(e.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="https://vimeo.com/... or https://loom.com/..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#191919]">Description *</label>
                <textarea
                  rows={4}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  placeholder="Describe your session, plan, or product..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {notice && <p className="text-xs text-[#4a4a4a]">{notice}</p>}

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => handleSubmit('draft')}
                  className="w-full rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b80f0a] disabled:opacity-60 sm:w-auto"
                  disabled={saving}
                >
                  {saving && saveIntent === 'draft' ? 'Saving draft...' : 'Save draft'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit('published')}
                  className="w-full rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#191919] disabled:cursor-not-allowed disabled:bg-[#b80f0a] disabled:text-white sm:w-auto"
                  disabled={saving || !canPublish}
                >
                  {saving && saveIntent === 'published' ? 'Publishing...' : 'Publish'}
                </button>
                <Link href="/coach/marketplace" className="w-full rounded-full border border-[#191919] px-4 py-2 text-center text-sm font-semibold text-[#191919] sm:w-auto">
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
