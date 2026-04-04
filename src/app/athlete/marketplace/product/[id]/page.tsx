'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { useAthleteAccess } from '@/components/AthleteAccessProvider'

const CART_STORAGE_KEY = 'athlete-marketplace-cart'
const RECENT_STORAGE_KEY = 'athlete-marketplace-recent'

type ProductRow = {
  id: string
  title?: string | null
  name?: string | null
  type?: string | null
  category?: string | null
  price?: number | string | null
  price_cents?: number | null
  sale_price?: number | string | null
  discount_label?: string | null
  status?: string | null
  coach_id?: string | null
  org_id?: string | null
  media_url?: string | null
  description?: string | null
  duration?: string | null
  format?: string | null
  next_available?: string | null
  includes?: string[] | null
  refund_policy?: string | null
  coach_bio?: string | null
  price_label?: string | null
}

type ReviewRow = {
  id: string
  product_id?: string | null
  athlete_id?: string | null
  rating?: number | null
  body?: string | null
  created_at?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  coach_refund_policy?: string | null
}

const PRODUCT_MEDIA_BUCKET = 'product-media'

type CartItem = {
  id: string
  title: string
  price: number
  priceLabel?: string | null
  mediaUrl?: string | null
  format?: string | null
  duration?: string | null
  creator?: string | null
  quantity: number
}

const parseAmount = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isNaN(parsed) ? 0 : parsed
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '$0'
  if (typeof value === 'string') {
    return value.trim().startsWith('$') ? value : `$${value}`
  }
  return `$${value.toFixed(2).replace(/\.00$/, '')}`
}

const formatShortDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AthleteProductDetailPage() {
  const supabase = createClientComponentClient()
  const { canTransact, needsGuardianApproval } = useAthleteAccess()
  const params = useParams()
  const productId = typeof params?.id === 'string' ? params.id : ''

  const [product, setProduct] = useState<ProductRow | null>(null)
  const [coachName, setCoachName] = useState('')
  const [coachRefundPolicy, setCoachRefundPolicy] = useState('')
  const [orgRefundPolicy, setOrgRefundPolicy] = useState('')
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [reviewers, setReviewers] = useState<Record<string, string>>({})
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [notice, setNotice] = useState('')
  const [cartNotice, setCartNotice] = useState('')
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

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
    if (typeof window === 'undefined') return
    const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
    if (storedCart) setCartItems(JSON.parse(storedCart))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems))
  }, [cartItems])

  useEffect(() => {
    if (!productId) return
    let mounted = true
    const loadProduct = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single()

      if (!mounted) return

      const row = data as ProductRow | null
      setProduct(row)

      if (row?.coach_id) {
        const { data: profile } = await supabase
          .from('profiles')
        .select('id, full_name, coach_refund_policy')
        .eq('id', row.coach_id)
        .single()
      if (profile && mounted) {
        const profileRow = profile as ProfileRow & { coach_refund_policy?: string | null }
        setCoachName(profileRow.full_name || '')
        setCoachRefundPolicy(profileRow.coach_refund_policy || '')
      }
    } else if (row?.org_id) {
      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('org_name, org_refund_policy')
        .eq('org_id', row.org_id)
        .maybeSingle()
      const orgSettingRow = (orgSettings || null) as {
        org_name?: string | null
        org_refund_policy?: string | null
      } | null
      if (mounted) {
        setCoachName(orgSettingRow?.org_name || '')
        setOrgRefundPolicy(orgSettingRow?.org_refund_policy || '')
      }
    }

      if (row?.media_url) {
        if (row.media_url.startsWith('http')) {
          setMediaUrl(row.media_url)
        } else {
          const { data: signed } = await supabase.storage
            .from(PRODUCT_MEDIA_BUCKET)
            .createSignedUrl(row.media_url, 60 * 30)
          setMediaUrl(signed?.signedUrl || null)
        }
      } else {
        setMediaUrl(null)
      }

      setLoading(false)
    }

    loadProduct()

    return () => {
      mounted = false
    }
  }, [productId, supabase])

  useEffect(() => {
    if (!productId || typeof window === 'undefined') return

    const updateRecentlyViewed = async () => {
      const storedRecent = window.localStorage.getItem(RECENT_STORAGE_KEY)
      let currentRecent: string[] = []
      if (storedRecent) {
        try {
          currentRecent = JSON.parse(storedRecent)
        } catch {
          currentRecent = []
        }
      }

      const nextRecent = [productId, ...currentRecent.filter((id) => id !== productId)].slice(0, 12)
      window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(nextRecent))

      try {
        const response = await fetch('/api/athlete/marketplace-preferences')
        const data = response.ok ? await response.json() : null
        const preferences = data?.preferences || {}
        const remoteRecent = Array.isArray(preferences.recently_viewed) ? preferences.recently_viewed : []
        const mergedRecent = [productId, ...remoteRecent.filter((id: string) => id !== productId)].slice(0, 12)
        await fetch('/api/athlete/marketplace-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preferences: {
              recent_searches: Array.isArray(preferences.recent_searches) ? preferences.recent_searches : [],
              saved_ids: Array.isArray(preferences.saved_ids) ? preferences.saved_ids : [],
              recently_viewed: mergedRecent,
            },
          }),
        })
      } catch {
        // best-effort
      }
    }

    updateRecentlyViewed()
  }, [productId])

  useEffect(() => {
    if (!productId) return
    let mounted = true
    const loadReviews = async () => {
      const { data } = await supabase
        .from('reviews')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })

      if (!mounted) return
      const rows = (data || []) as ReviewRow[]
      setReviews(rows)

      const athleteIds = Array.from(new Set(rows.map((row) => row.athlete_id).filter(Boolean) as string[]))
      if (athleteIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', athleteIds)
        const map: Record<string, string> = {}
        const athleteProfiles = (profiles || []) as ProfileRow[]
        athleteProfiles.forEach((profile) => {
          if (profile.full_name) {
            map[profile.id] = profile.full_name
          }
        })
        if (mounted) {
          setReviewers(map)
        }
      } else {
        setReviewers({})
      }
    }
    loadReviews()

    return () => {
      mounted = false
    }
  }, [productId, supabase])

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0
    const total = reviews.reduce((sum, review) => sum + (review.rating || 0), 0)
    return Math.round((total / reviews.length) * 10) / 10
  }, [reviews])

  const cartCount = useMemo(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0)
  }, [cartItems])

  const addToCart = () => {
    if (!product) return
    const title = product.title || product.name || 'Product'
    const basePrice = product.price_cents ? product.price_cents / 100 : parseAmount(product.price)
    const salePriceValue =
      product.sale_price !== null && product.sale_price !== undefined ? parseAmount(product.sale_price) : null
    const priceValue =
      salePriceValue !== null && salePriceValue > 0 && salePriceValue < basePrice ? salePriceValue : basePrice
    const creator = coachName || 'Organization'
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }
      return [
        ...prev,
        {
          id: product.id,
          title,
          price: priceValue,
          priceLabel: product.price_label,
          mediaUrl: mediaUrl || undefined,
          format: product.format || product.type || product.category || undefined,
          duration: product.duration || undefined,
          creator,
          quantity: 1,
        },
      ]
    })
    setCartNotice(`${title} added to cart.`)
  }

  const handleSubmitReview = async (event: React.FormEvent) => {
    event.preventDefault()
    setNotice('')
    if (!currentUserId) {
      setNotice('Sign in to leave a review.')
      return
    }
    if (!reviewText.trim()) {
      setNotice('Write a short review before submitting.')
      return
    }

    const { error } = await supabase.from('reviews').insert({
      product_id: productId,
      athlete_id: currentUserId,
      rating,
      body: reviewText.trim(),
    })

    if (error) {
      setNotice('Could not save review. Check your reviews table columns.')
      return
    }

    setReviewText('')
    setNotice('Review submitted.')
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
    setReviews((data || []) as ReviewRow[])
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Marketplace</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Product details</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">See reviews and book instantly.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/athlete/marketplace/cart"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
            >
              Cart {cartCount > 0 ? `(${cartCount})` : ''}
            </Link>
            <Link
              href="/athlete/marketplace"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
            >
              Back to marketplace
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-6">
              {loading ? (
                <p className="text-sm text-[#4a4a4a]">Loading product...</p>
              ) : !product ? (
                <p className="text-sm text-[#4a4a4a]">Product not found.</p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-4">
                    {mediaUrl && (
                      <Image
                        src={mediaUrl}
                        alt={product.title || product.name || 'Product'}
                        width={800}
                        height={448}
                        className="h-56 w-full rounded-3xl object-cover"
                      />
                    )}
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{product.type || product.category || 'Offer'}</p>
                      <h2 className="mt-2 text-3xl font-semibold text-[#191919]">{product.title || product.name || 'Product'}</h2>
                      <p className="mt-2 text-sm text-[#4a4a4a]">{product.description || 'No description provided.'}</p>
                      <p className="mt-3 text-sm font-semibold text-[#191919]">Seller: {coachName || 'Organization'}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#4a4a4a]">
                        <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                          {(product.format || product.type || product.category || 'Offer').toString().toUpperCase()}
                        </span>
                        {product.duration ? (
                          <span className="rounded-full border border-[#dcdcdc] px-3 py-1">{product.duration}</span>
                        ) : null}
                        <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                          Next: {formatShortDate(product.next_available)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Price</p>
                      <div className="mt-2 flex items-center gap-2 text-2xl font-semibold text-[#191919]">
                        <span>
                          {formatCurrency(
                            product.sale_price !== null && product.sale_price !== undefined
                              ? parseAmount(product.sale_price)
                              : product.price_cents
                                ? product.price_cents / 100
                                : product.price,
                          )}
                        </span>
                        {product.sale_price ? (
                          <span className="text-sm font-normal text-[#6b5f55] line-through">
                            {formatCurrency(product.price_cents ? product.price_cents / 100 : product.price)}
                          </span>
                        ) : null}
                        {product.discount_label ? (
                          <span className="rounded-full border border-[#191919] px-2 py-1 text-xs font-semibold text-[#191919]">
                            {product.discount_label}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-[#4a4a4a]">
                        {product.price_label ? `${product.price_label} · ` : ''}Average rating: {averageRating || '—'}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={`/athlete/marketplace/checkout/${product.id}`}
                          className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold ${
                            canTransact
                              ? 'bg-[#b80f0a] text-white'
                              : 'bg-[#dcdcdc] text-[#9a9a9a] pointer-events-none'
                          }`}
                        >
                          Purchase now
                        </Link>
                        <button
                          type="button"
                          onClick={addToCart}
                          disabled={!canTransact}
                          className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                        >
                          Add to cart
                        </button>
                        <Link
                          href="/athlete/marketplace/cart"
                          className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                        >
                          View cart
                        </Link>
                      </div>
                      {needsGuardianApproval ? (
                        <p className="mt-2 text-xs text-[#b80f0a]">Guardian approval required to purchase.</p>
                      ) : null}
                      {cartNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{cartNotice}</p> : null}
                    </div>

                    <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">What&apos;s included</p>
                      <ul className="mt-3 space-y-2 text-sm text-[#4a4a4a]">
                        {(product.includes && product.includes.length > 0
                          ? product.includes
                          : ['Personalized plan', 'Coach feedback', 'Progress tracking']
                        ).map((item) => (
                          <li key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2">
                            {item}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs text-[#4a4a4a]">
                        Refund policy:{' '}
                        {product.refund_policy || coachRefundPolicy || orgRefundPolicy || 'Standard refund policy applies.'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Delivery details</p>
                      <div className="mt-3 space-y-2 text-sm text-[#4a4a4a]">
                        <p>
                          Format: <span className="font-semibold text-[#191919]">{product.format || product.type || 'Offer'}</span>
                        </p>
                        <p>
                          Duration: <span className="font-semibold text-[#191919]">{product.duration || 'Flexible'}</span>
                        </p>
                        <p>
                          Availability:{' '}
                          <span className="font-semibold text-[#191919]">
                            {product.next_available ? `Next ${formatShortDate(product.next_available)}` : 'Available now'}
                          </span>
                        </p>
                        <p className="text-xs text-[#4a4a4a]">
                          Session-format products are purchased here. Scheduling and logistics are coordinated after purchase.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">FAQ</p>
                      <div className="mt-3 space-y-2 text-sm text-[#4a4a4a]">
                        <p className="font-semibold text-[#191919]">Can I reschedule?</p>
                        <p>For session-format purchases, the coach will confirm scheduling and reschedule rules after purchase.</p>
                        <p className="font-semibold text-[#191919]">How do I access digital content?</p>
                        <p>Digital plans show up in your athlete portal once purchased.</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coach bio</p>
                      <p className="mt-2 text-sm text-[#4a4a4a]">
                        {product.coach_bio || 'Coach bio will appear here once available.'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Reviews</p>
                      <div className="mt-3 space-y-3">
                        {reviews.length === 0 ? (
                          <p className="text-xs text-[#4a4a4a]">No reviews yet.</p>
                        ) : (
                          reviews.map((review) => (
                            <div key={review.id} className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2">
                              <div className="flex items-center justify-between text-xs text-[#4a4a4a]">
                                <span>{review.athlete_id ? reviewers[review.athlete_id] : 'Athlete'}</span>
                                <span>{review.rating || 0}★</span>
                              </div>
                              <p className="mt-2 text-sm text-[#191919]">{review.body}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[#191919]">Leave a review</h3>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Share what you liked about this coach or product.</p>
                </div>
              </div>
              <form onSubmit={handleSubmitReview} className="mt-4 grid gap-4 md:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Rating</label>
                  <select
                    value={rating}
                    onChange={(event) => setRating(Number(event.target.value))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  >
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>{value} stars</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Review</label>
                  <textarea
                    value={reviewText}
                    onChange={(event) => setReviewText(event.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="Share your experience"
                  />
                </div>
                {notice && <p className="md:col-span-2 text-xs text-[#4a4a4a]">{notice}</p>}
                <div className="md:col-span-2">
                  <button type="submit" className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white">
                    Submit review
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
