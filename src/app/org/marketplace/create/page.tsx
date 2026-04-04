'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import {
  ORG_FEATURES,
  ORG_MARKETPLACE_LIMITS,
  formatTierName,
  isOrgPlanActive,
  normalizeOrgStatus,
  normalizeOrgTier,
} from '@/lib/planRules'

const types = [
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

const parsePrice = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

export default function CreateOrgProductPage() {
  const supabase = createClientComponentClient()
  const [title, setTitle] = useState('')
  const [type, setType] = useState(types[0])
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
  const [description, setDescription] = useState('')
  const [inventory, setInventory] = useState('')
  const [shippingRequired, setShippingRequired] = useState(false)
  const [shippingNotes, setShippingNotes] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveIntent, setSaveIntent] = useState<'draft' | 'published' | null>(null)
  const [toast, setToast] = useState('')
  const [orgStripeConnected, setOrgStripeConnected] = useState<boolean | null>(null)
  const [orgTier, setOrgTier] = useState<'standard' | 'growth' | 'enterprise'>('standard')
  const [planStatus, setPlanStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled'>('trialing')
  const [defaultRefundPolicy, setDefaultRefundPolicy] = useState('')
  const [activeOrgListings, setActiveOrgListings] = useState(0)

  useEffect(() => {
    let mounted = true
    const loadOrg = async () => {
      const [marketplaceResponse, settingsResponse] = await Promise.all([
        fetch('/api/org/marketplace'),
        fetch('/api/org/settings'),
      ])
      if (!mounted) return
      if (marketplaceResponse.ok) {
        const payload = await marketplaceResponse.json()
        setOrgStripeConnected(Boolean(payload.orgStripeConnected))
        const activeCount = (payload.orgProducts || []).filter(
          (product: { status?: string | null }) => String(product.status || '').toLowerCase() === 'published'
        ).length
        setActiveOrgListings(activeCount)
      } else {
        setOrgStripeConnected(false)
      }

      if (settingsResponse.ok) {
        const payload = await settingsResponse.json()
        setOrgTier(normalizeOrgTier(payload.settings?.plan))
        setPlanStatus(normalizeOrgStatus(payload.settings?.plan_status))
        setDefaultRefundPolicy(payload.settings?.org_refund_policy || '')
      }
    }
    loadOrg()
    return () => {
      mounted = false
    }
  }, [])

  const planActive = isOrgPlanActive(planStatus)
  const marketplaceEnabled = planActive && ORG_FEATURES[orgTier].marketplacePublishing
  const marketplaceLimit = ORG_MARKETPLACE_LIMITS[orgTier]
  const publishCapReached = marketplaceLimit !== null && activeOrgListings >= marketplaceLimit
  const tierLabel = formatTierName(orgTier)
  const statusLabel = formatTierName(planStatus)
  const canPublish = marketplaceEnabled && orgStripeConnected === true && !publishCapReached

  const handleSubmit = async (nextStatus: 'published' | 'draft') => {
    setNotice('')
    if (nextStatus === 'published' && !marketplaceEnabled) {
      setNotice(planActive ? 'Upgrade to Growth or Enterprise to publish org products.' : 'Activate billing to publish org products.')
      return
    }
    if (nextStatus === 'published' && orgStripeConnected !== true) {
      setNotice('Connect Stripe before publishing org products.')
      return
    }
    if (nextStatus === 'published' && publishCapReached) {
      setNotice(`Marketplace listing limit reached (${marketplaceLimit}). Unpublish a listing to add more.`)
      return
    }
    if (!title.trim()) {
      setNotice('Add a title to continue.')
      return
    }
    if (!type.trim()) {
      setNotice('Select a product type to continue.')
      return
    }
    const priceValue = parsePrice(price)
    const salePriceValue = salePrice ? parsePrice(salePrice) : null
    const inventoryValue = inventory ? Number.parseInt(inventory, 10) : null
    const effectiveRefundPolicy = refundPolicy.trim() || defaultRefundPolicy.trim() || null
    const normalizedFormat = String(format || '').trim().toLowerCase()
    if (!effectiveRefundPolicy) {
      setNotice('Add a refund policy to continue.')
      return
    }

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
      if (!normalizedFormat) {
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
      if (normalizedFormat === 'physical' && (!Number.isFinite(inventoryValue) || inventoryValue === null || inventoryValue < 1)) {
        setNotice('Physical products require an inventory count of at least 1 before publishing.')
        return
      }
      if (shippingRequired && !shippingNotes.trim()) {
        setNotice('Add shipping notes when shipping is required.')
        return
      }
    }

    setSaving(true)
    setSaveIntent(nextStatus)

    let mediaPath: string | null = null

    if (media) {
      const extension = media.name.split('.').pop()
      const safeName = media.name.replace(/[^a-zA-Z0-9._-]/g, '')
      const filePath = `org/${Date.now()}-${safeName || 'media'}.${extension || 'file'}`
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

    const response = await fetch('/api/org/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        type,
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
        refund_policy: effectiveRefundPolicy,
        description: description.trim() || null,
        media_url: mediaPath,
        inventory_count: Number.isFinite(inventoryValue) ? inventoryValue : null,
        shipping_required: shippingRequired,
        shipping_notes: shippingNotes.trim() || null,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setNotice(data?.error || 'Unable to save product.')
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
    setInventory('')
    setShippingNotes('')
    setShippingRequired(false)
    setNotice(nextStatus === 'draft' ? 'Draft saved.' : 'Product published.')
    setToast('Save complete')
    setSaving(false)
    setSaveIntent(null)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="glass-card border border-[#191919] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Org marketplace</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Create a product</h1>
              </div>
              <Link href="/org/marketplace" className="text-sm font-semibold text-[#b80f0a]">Back to marketplace</Link>
            </div>

            {!planActive ? (
              <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                Billing status: {statusLabel}. Activate billing to publish org products.
              </div>
            ) : null}
            {planActive && !ORG_FEATURES[orgTier].marketplacePublishing ? (
              <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                Org marketplace publishing is available on Growth or Enterprise. Current plan: {tierLabel}.
              </div>
            ) : null}
            {orgStripeConnected === null ? (
              <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                Checking Stripe connection...
              </div>
            ) : null}
            {orgStripeConnected === false ? (
              <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                <p className="font-semibold text-[#191919]">Connect Stripe to create org products</p>
                <p className="mt-2">Set your Stripe account in org settings before publishing items.</p>
                <Link
                  href="/org/settings"
                  className="mt-4 inline-flex rounded-full border border-[#b80f0a] px-4 py-2 text-sm font-semibold text-[#b80f0a]"
                >
                  Go to settings
                </Link>
              </div>
            ) : null}

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
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {types.map((t) => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setType(t)}
                        className={`rounded-2xl border px-4 py-3 text-left font-semibold transition ${
                          type === t ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
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
                      placeholder="per seat, per athlete"
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
                      placeholder="2-day camp, 60 min"
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
                    placeholder="Team session plan, Travel checklist, Coach Q&A"
                    value={includesText}
                    onChange={(e) => setIncludesText(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Refund policy *</label>
                  <textarea
                    rows={3}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="Leave blank to use org policy."
                    value={refundPolicy}
                    onChange={(e) => setRefundPolicy(e.target.value)}
                  />
                  {defaultRefundPolicy ? (
                    <p className="text-xs text-[#4a4a4a]">Org default: {defaultRefundPolicy}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#191919]">Inventory count * (physical)</label>
                    <input
                      value={inventory}
                      onChange={(e) => setInventory(e.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      placeholder="Optional"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#191919]">Shipping required</label>
                    <button
                      type="button"
                      onClick={() => setShippingRequired((prev) => !prev)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${
                        shippingRequired ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                      }`}
                    >
                      {shippingRequired ? 'Yes, collect shipping info' : 'No shipping required'}
                    </button>
                  </div>
                </div>

                {shippingRequired ? (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#191919]">Shipping notes * (when shipping required)</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      placeholder="Pickup details or shipping policy"
                      value={shippingNotes}
                      onChange={(e) => setShippingNotes(e.target.value)}
                    />
                  </div>
                ) : null}

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

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191919]">Description *</label>
                  <textarea
                    rows={4}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="Describe the product..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                {notice && <p className="text-xs text-[#4a4a4a]">{notice}</p>}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b80f0a] disabled:opacity-60"
                    disabled={saving}
                    onClick={() => handleSubmit('draft')}
                  >
                    {saving && saveIntent === 'draft' ? 'Saving draft...' : 'Save draft'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] disabled:opacity-60"
                    disabled={saving || !canPublish}
                    onClick={() => handleSubmit('published')}
                  >
                    {saving && saveIntent === 'published' ? 'Publishing...' : 'Publish'}
                  </button>
                  <Link href="/org/marketplace" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
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
