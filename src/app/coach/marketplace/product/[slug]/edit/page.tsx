'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

type ProductRow = {
  id: string
  title?: string | null
  name?: string | null
  type?: string | null
  category?: string | null
  price?: number | string | null
  sale_price?: number | string | null
  discount_label?: string | null
  price_label?: string | null
  format?: string | null
  duration?: string | null
  next_available?: string | null
  includes?: string[] | null
  refund_policy?: string | null
  description?: string | null
  price_cents?: number | null
  status?: string | null
  media_url?: string | null
}

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
  return `$${value.toFixed(2).replace(/\.00$/, '')}`
}

const deslugify = (slug: string) => slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

export default function EditProductPage() {
  const supabase = createClientComponentClient()
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const productId = searchParams?.get('id') || ''
  const slug = typeof params?.slug === 'string' ? params.slug : ''

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
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'published' | 'draft'>('published')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) {
        setCurrentUserId(data.user?.id ?? null)
      }
    }
    const loadProduct = async () => {
      setLoading(true)
      setNotice('')

      let product: ProductRow | null = null

      if (productId) {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single()
        product = data as ProductRow
      } else if (slug) {
        const searchTitle = deslugify(slug)
        const { data } = await supabase
          .from('products')
          .select('*')
          .ilike('title', `%${searchTitle}%`)
          .limit(1)
          .single()
        product = data as ProductRow
      }

      if (!mounted) return

      if (!product) {
        setNotice('Product not found.')
        setLoading(false)
        return
      }

      setResolvedId(product.id)
      setTitle(product.title || product.name || '')
      setType(
        product.category
          ? product.category.split(',').map((value) => value.trim()).filter(Boolean)[0] || ''
          : product.type
            ? product.type.split(',').map((value) => value.trim()).filter(Boolean)[0] || ''
            : '',
      )
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
      setDescription(product.description || '')
      setStatus((product.status as 'published' | 'draft') || 'published')
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

    loadProduct()
    loadUser()

    return () => {
      mounted = false
    }
  }, [productId, slug, supabase])

  const handleSave = async () => {
    if (!resolvedId) return
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
      if (!currentUserId) {
        setNotice('Sign in to upload media.')
        setSaving(false)
        return
      }
      const extension = mediaFile.name.split('.').pop()
      const safeName = mediaFile.name.replace(/[^a-zA-Z0-9._-]/g, '')
      const filePath = `${currentUserId}/${Date.now()}-${safeName || 'media'}.${extension || 'file'}`
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

    const response = await fetch(`/api/coach/products/${resolvedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        type: type.trim() || null,
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
        status,
        media_url: uploadedPath,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setNotice(payload?.error || 'Unable to save product.')
      setSaving(false)
      return
    }

    setNotice('Product updated.')
    setToast('Save complete')
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!resolvedId) return
    const confirmed = window.confirm('Delete this product? This cannot be undone.')
    if (!confirmed) return
    setDeleting(true)
    setNotice('')
    const response = await fetch(`/api/coach/products/${resolvedId}`, { method: 'DELETE' })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setNotice(data?.error || 'Unable to delete product.')
      setDeleting(false)
      return
    }
    router.push('/coach/marketplace')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="glass-card border border-[#191919] bg-white p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Edit product</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Update details</h1>
              </div>
              <Link href="/coach/marketplace" className="text-sm font-semibold text-[#b80f0a]">Back to marketplace</Link>
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
                    <label className="text-sm font-semibold text-[#191919]">Type</label>
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
                    <label className="text-sm font-semibold text-[#191919]">Refund policy</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      placeholder="Leave blank to use your coach policy."
                      value={refundPolicy}
                      onChange={(e) => setRefundPolicy(e.target.value)}
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
                    <label className="text-sm font-semibold text-[#191919]">Status</label>
                    <div className="flex flex-col gap-2 text-sm sm:flex-row">
                      {[['published', 'Publish'], ['draft', 'Save as draft']].map(([key, label]) => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => setStatus(key as 'published' | 'draft')}
                          className={`w-full rounded-full border px-4 py-2 font-semibold transition sm:w-auto ${
                            status === key ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
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
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button className="w-full rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b80f0a] sm:w-auto" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <Link href="/coach/marketplace" className="w-full rounded-full border border-[#191919] px-4 py-2 text-center text-sm font-semibold text-[#191919] sm:w-auto">Cancel</Link>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="w-full rounded-full border border-[#b80f0a] px-4 py-2 text-sm font-semibold text-[#b80f0a] sm:w-auto"
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
