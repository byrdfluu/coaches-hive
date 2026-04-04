'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { useParams, useRouter } from 'next/navigation'
import {
  ORG_FEATURES,
  ORG_MARKETPLACE_LIMITS,
  formatTierName,
  isOrgPlanActive,
  normalizeOrgStatus,
  normalizeOrgTier,
} from '@/lib/planRules'

type ProductRow = {
  id: string
  title?: string | null
  name?: string | null
  price?: number | string | null
  price_cents?: number | null
  status?: string | null
  media_url?: string | null
  type?: string | null
  description?: string | null
  sale_price?: number | string | null
  discount_label?: string | null
  price_label?: string | null
  format?: string | null
  duration?: string | null
  next_available?: string | null
  includes?: string[] | null
  refund_policy?: string | null
  inventory_count?: number | null
  shipping_required?: boolean | null
  shipping_notes?: string | null
}

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

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    return value.trim().startsWith('$') ? value : `$${value}`
  }
  return `$${value.toFixed(2).replace(/\\.00$/, '')}`
}

export default function EditOrgProductPage() {
  const supabase = createClientComponentClient()
  const params = useParams()
  const router = useRouter()
  const productId = typeof params?.id === 'string' ? params.id : ''

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
  const [status, setStatus] = useState<'published' | 'draft'>('published')
  const [description, setDescription] = useState('')
  const [inventory, setInventory] = useState('')
  const [shippingRequired, setShippingRequired] = useState(false)
  const [shippingNotes, setShippingNotes] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [orgTier, setOrgTier] = useState<'standard' | 'growth' | 'enterprise'>('standard')
  const [planStatus, setPlanStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled'>('trialing')
  const [activeOrgListings, setActiveOrgListings] = useState(0)

  useEffect(() => {
    let mounted = true
    const loadProduct = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch(`/api/org/products/${productId}`)
      if (!response.ok) {
        setNotice('Product not found.')
        setLoading(false)
        return
      }
      const payload = await response.json()
      const product = payload.product as ProductRow
      if (!mounted || !product) return

      setTitle(product.title || product.name || '')
      const priceValue = product.price_cents ? product.price_cents / 100 : product.price
      setPrice(formatCurrency(priceValue))
      const saleValue = product.sale_price ? product.sale_price : null
      setSalePrice(saleValue ? formatCurrency(saleValue) : '')
      setDiscountLabel(product.discount_label || '')
      setPriceLabel(product.price_label || '')
      setFormat(product.format || 'digital')
      setDuration(product.duration || '')
      setNextAvailable(product.next_available ? product.next_available.slice(0, 16) : '')
      setIncludesText(product.includes?.join(', ') || '')
      setRefundPolicy(product.refund_policy || '')
      setStatus((product.status as 'published' | 'draft') || 'published')
      setType(product.type || '')
      setDescription(product.description || '')
      setInventory(
        product.inventory_count !== null && product.inventory_count !== undefined
          ? String(product.inventory_count)
          : ''
      )
      setShippingRequired(Boolean(product.shipping_required))
      setShippingNotes(product.shipping_notes || '')
      const storedMedia = product.media_url || null
      setMediaUrl(storedMedia)
      if (storedMedia) {
        if (storedMedia.startsWith('http')) {
          setMediaPreviewUrl(storedMedia)
        } else {
          const { data: signed } = await supabase.storage
            .from(PRODUCT_MEDIA_BUCKET)
            .createSignedUrl(storedMedia, 60 * 60)
          setMediaPreviewUrl(signed?.signedUrl || null)
        }
      } else {
        setMediaPreviewUrl(null)
      }
      setLoading(false)
    }

    if (productId) {
      loadProduct()
    }

    return () => {
      mounted = false
    }
  }, [productId, supabase])

  useEffect(() => {
    let active = true
    const loadSettings = async () => {
      const [settingsResponse, marketplaceResponse] = await Promise.all([
        fetch('/api/org/settings'),
        fetch('/api/org/marketplace'),
      ])
      if (!active) return
      if (settingsResponse.ok) {
        const payload = await settingsResponse.json()
        setOrgTier(normalizeOrgTier(payload.settings?.plan))
        setPlanStatus(normalizeOrgStatus(payload.settings?.plan_status))
      }
      if (marketplaceResponse.ok) {
        const payload = await marketplaceResponse.json()
        const activeCount = (payload.orgProducts || []).filter(
          (product: { status?: string | null }) => String(product.status || '').toLowerCase() === 'published'
        ).length
        setActiveOrgListings(activeCount)
      }
    }
    loadSettings()
    return () => {
      active = false
    }
  }, [])

  const planActive = isOrgPlanActive(planStatus)
  const marketplaceEnabled = planActive && ORG_FEATURES[orgTier].marketplacePublishing
  const marketplaceLimit = ORG_MARKETPLACE_LIMITS[orgTier]
  const publishCapReached = marketplaceLimit !== null && activeOrgListings >= marketplaceLimit
  const statusLabel = formatTierName(planStatus)
  const tierLabel = formatTierName(orgTier)
  const typeOptions = type && !types.includes(type) ? [type, ...types] : types

  const handleSave = async () => {
    if (!productId) return
    if (status === 'published' && !marketplaceEnabled) {
      setNotice(planActive ? 'Upgrade to Growth or Enterprise to update org products.' : 'Activate billing to update org products.')
      return
    }
    if (status === 'published' && publishCapReached) {
      setNotice(`Marketplace listing limit reached (${marketplaceLimit}). Unpublish a listing to add more.`)
      return
    }
    setSaving(true)
    setNotice('')
    const salePriceValue = salePrice ? parsePrice(salePrice) : null
    const priceValue = parsePrice(price)
    if (salePriceValue !== null && priceValue !== null && salePriceValue >= priceValue) {
      setNotice('Sale price must be lower than the main price.')
      setSaving(false)
      return
    }
    let uploadedPath = mediaUrl

    if (mediaFile) {
      const extension = mediaFile.name.split('.').pop()
      const safeName = mediaFile.name.replace(/[^a-zA-Z0-9._-]/g, '')
      const filePath = `org/${Date.now()}-${safeName || 'media'}.${extension || 'file'}`
      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_MEDIA_BUCKET)
        .upload(filePath, mediaFile, { upsert: true })

      if (uploadError) {
        setNotice('Upload failed. Make sure the product-media bucket exists and is public.')
        setSaving(false)
        return
      }

      uploadedPath = filePath
    }

    const response = await fetch(`/api/org/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        type: type || null,
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
        status,
        description: description.trim() || null,
        media_url: uploadedPath,
        inventory_count: inventory ? Number.parseInt(inventory, 10) : null,
        shipping_required: shippingRequired,
        shipping_notes: shippingNotes.trim() || null,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setNotice(data?.error || 'Unable to save product.')
      setSaving(false)
      return
    }

    setNotice('Product updated.')
    setToast('Save complete')
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!productId) return
    const confirmed = window.confirm('Delete this product? This cannot be undone.')
    if (!confirmed) return
    setDeleting(true)
    setNotice('')
    const response = await fetch(`/api/org/products/${productId}`, { method: 'DELETE' })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setNotice(data?.error || 'Unable to delete product.')
      setDeleting(false)
      return
    }
    router.push('/org/marketplace')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="glass-card border border-[#191919] bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Edit product</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Update org product</h1>
                {!planActive ? (
                  <p className="mt-2 text-xs text-[#4a4a4a]">
                    Billing status: {statusLabel}. Activate billing to update products.
                  </p>
                ) : !ORG_FEATURES[orgTier].marketplacePublishing ? (
                  <p className="mt-2 text-xs text-[#4a4a4a]">
                    Org marketplace publishing is available on Growth or Enterprise. Current plan: {tierLabel}.
                  </p>
                ) : null}
              </div>
              <Link href="/org/marketplace" className="text-sm font-semibold text-[#b80f0a]">Back to marketplace</Link>
            </div>

            <div className="mt-6 space-y-4">
              {loading ? (
                <p className="text-sm text-[#4a4a4a]">Loading product...</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#191919]">Title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#191919]">Description</label>
                    <textarea
                      rows={4}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#191919]">Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    >
                      {typeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#191919]">Price</label>
                      <input
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
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
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#191919]">Status</label>
                    <div className="flex gap-2 text-sm">
                      {[['published', 'Publish'], ['draft', 'Save as draft']].map(([key, label]) => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => setStatus(key as 'published' | 'draft')}
                          disabled={key === 'published' && (!marketplaceEnabled || publishCapReached)}
                          className={`rounded-full border px-4 py-2 font-semibold transition disabled:opacity-50 ${
                            status === key ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {!marketplaceEnabled ? (
                      <p className="text-xs text-[#4a4a4a]">
                        Upgrade to Growth or Enterprise to publish org products.
                      </p>
                    ) : publishCapReached ? (
                      <p className="text-xs text-[#4a4a4a]">
                        Listing limit reached ({marketplaceLimit}). Unpublish a listing to add more.
                      </p>
                    ) : null}
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
                      <label className="text-sm font-semibold text-[#191919]">Format</label>
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
                    <label className="text-sm font-semibold text-[#191919]">Refund policy</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      placeholder="Leave blank to use org policy."
                      value={refundPolicy}
                      onChange={(e) => setRefundPolicy(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#191919]">Inventory count</label>
                      <input
                        value={inventory}
                        onChange={(e) => setInventory(e.target.value)}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
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
                      <label className="text-sm font-semibold text-[#191919]">Shipping notes</label>
                      <textarea
                        rows={3}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                        value={shippingNotes}
                        onChange={(e) => setShippingNotes(e.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#191919]">Media</label>
                    {mediaPreviewUrl && (
                      <Image
                        src={mediaPreviewUrl}
                        alt="Product media"
                        width={800}
                        height={320}
                        className="mb-3 h-32 w-full rounded-2xl object-cover"
                      />
                    )}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(event) => setMediaFile(event.target.files?.[0] || null)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    />
                  </div>
                  {notice && <p className="text-xs text-[#4a4a4a]">{notice}</p>}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b80f0a] disabled:opacity-60"
                      onClick={handleSave}
                      disabled={saving || !marketplaceEnabled}
                    >
                      {saving ? 'Saving...' : 'Save changes'}
                    </button>
                    <Link href="/org/marketplace" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
                      Cancel
                    </Link>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-full border border-[#b80f0a] px-4 py-2 text-sm font-semibold text-[#b80f0a]"
                    >
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
