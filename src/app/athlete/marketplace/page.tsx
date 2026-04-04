'use client'

export const dynamic = 'force-dynamic'

import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import { useAthleteAccess } from '@/components/AthleteAccessProvider'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type ProductRow = {
  id: string
  title?: string | null
  name?: string | null
  type?: string | null
  category?: string | null
  price?: number | string | null
  price_cents?: number | null
  sale_price?: number | string | null
  status?: string | null
  coach_id?: string | null
  media_url?: string | null
  created_at?: string | null
  sport?: string | null
  format?: string | null
  duration?: string | null
  next_available?: string | null
  rating?: number | null
  review_count?: number | null
  best_for?: string | null
  purchases_30d?: number | null
  verified?: boolean | null
  featured?: boolean | null
  includes?: string[] | null
  refund_policy?: string | null
  coach_bio?: string | null
  creator_type?: 'coach' | 'org' | null
  creator_name?: string | null
  tags?: string[] | null
  bundle?: boolean | null
  price_label?: string | null
  discount_label?: string | null
}

type OrderRow = {
  id: string
  product_id?: string | null
  title?: string | null
  seller?: string | null
  status?: string | null
  fulfillment_status?: string | null
  refund_status?: string | null
  amount?: number | string | null
  created_at?: string | null
  receipt_id?: string | null
  receipt_url?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email?: string | null
}

const PRODUCT_MEDIA_BUCKET = 'product-media'
const CART_STORAGE_KEY = 'athlete-marketplace-cart'
const SEARCH_STORAGE_KEY = 'athlete-marketplace-searches'
const SAVED_STORAGE_KEY = 'athlete-marketplace-saved'
const RECENT_STORAGE_KEY = 'athlete-marketplace-recent'

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

const getPriceValue = (product: ProductRow) => {
  if (product.price_cents) return product.price_cents / 100
  return parseAmount(product.price)
}

const getEffectivePrice = (product: ProductRow) => {
  const basePrice = getPriceValue(product)
  const salePrice =
    product.sale_price !== null && product.sale_price !== undefined ? parseAmount(product.sale_price) : null
  if (salePrice !== null && salePrice > 0 && salePrice < basePrice) return salePrice
  return basePrice
}

const formatShortDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatAvailability = (value?: string | null) => {
  if (!value) return 'Available now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Available now'
  const now = new Date()
  if (date <= now) return 'Available now'
  return `Next: ${formatShortDate(value)}`
}

const toDisplayName = (fullName?: string | null, email?: string | null) => {
  const name = String(fullName || '').trim()
  if (name) return name
  const emailValue = String(email || '').trim()
  if (!emailValue) return ''
  return emailValue.split('@')[0].trim()
}

const resolveCreatorName = (product: ProductRow, coachNames: Record<string, string>) => {
  const rawCreatorName = String(product.creator_name || '').trim()
  const genericCreatorName = rawCreatorName.toLowerCase() === 'coach' || rawCreatorName.toLowerCase() === 'organization'
  const mappedCoachName = product.coach_id ? coachNames[product.coach_id] : ''
  return rawCreatorName && !genericCreatorName
    ? rawCreatorName
    : mappedCoachName || (product.creator_type === 'org' ? 'Organization' : 'Coach')
}

export default function AthleteMarketplacePage() {
  const supabase = createClientComponentClient()
  const { canTransact, needsGuardianApproval } = useAthleteAccess()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [coachNames, setCoachNames] = useState<Record<string, string>>({})
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [sportFilter, setSportFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState('all')
  const [priceFilter, setPriceFilter] = useState('all')
  const [creatorFilter, setCreatorFilter] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'relevance' | 'price-low' | 'price-high' | 'newest' | 'rating'>('relevance')
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [quickViewId, setQuickViewId] = useState<string | null>(null)
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([])
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [visibleCount, setVisibleCount] = useState(9)
  const [preferencesHydrated, setPreferencesHydrated] = useState(false)

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
    const loadPreferences = async () => {
      const storedSearches = window.localStorage.getItem(SEARCH_STORAGE_KEY)
      const storedSaved = window.localStorage.getItem(SAVED_STORAGE_KEY)
      const storedRecent = window.localStorage.getItem(RECENT_STORAGE_KEY)

      try {
        const response = await fetch('/api/athlete/marketplace-preferences')
        if (response.ok) {
          const data = await response.json()
          const preferences = data?.preferences || {}
          setRecentSearches(Array.isArray(preferences.recent_searches) ? preferences.recent_searches : [])
          setSavedIds(Array.isArray(preferences.saved_ids) ? preferences.saved_ids : [])
          setRecentlyViewed(Array.isArray(preferences.recently_viewed) ? preferences.recently_viewed : [])
          setPreferencesHydrated(true)
          return
        }
      } catch {
        // Fall through to local cache.
      }

      if (storedSearches) setRecentSearches(JSON.parse(storedSearches))
      if (storedSaved) setSavedIds(JSON.parse(storedSaved))
      if (storedRecent) setRecentlyViewed(JSON.parse(storedRecent))
      setPreferencesHydrated(true)
    }

    loadPreferences()

    // Load cart: DB first, fall back to localStorage
    fetch('/api/athlete/cart')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.cart && Array.isArray(data.cart) && data.cart.length > 0) {
          setCartItems(data.cart)
        } else {
          const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
          if (storedCart) {
            try { setCartItems(JSON.parse(storedCart)) } catch { /* ignore */ }
          }
        }
      })
      .catch(() => {
        const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
        if (storedCart) {
          try { setCartItems(JSON.parse(storedCart)) } catch { /* ignore */ }
        }
      })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !preferencesHydrated) return
    window.localStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(recentSearches))
    window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(savedIds))
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentlyViewed))
    fetch('/api/athlete/marketplace-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferences: {
          recent_searches: recentSearches,
          saved_ids: savedIds,
          recently_viewed: recentlyViewed,
        },
      }),
    }).catch(() => {/* best-effort */})
  }, [preferencesHydrated, recentSearches, recentlyViewed, savedIds])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems))
    // Sync cart to DB (best-effort)
    fetch('/api/athlete/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart: cartItems }),
    }).catch(() => {/* best-effort */})
  }, [cartItems])

  useEffect(() => {
    if (!currentUserId) return
    let mounted = true
    const loadData = async () => {
      setLoading(true)
      const [ordersResponse, productResponse] = await Promise.all([
        fetch('/api/athlete/orders', { cache: 'no-store' }),
        supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false }),
      ])

      if (!mounted) return

      if (ordersResponse.ok) {
        const payload = await ordersResponse.json().catch(() => ({}))
        if (!mounted) return
        setOrders((payload.orders || []) as OrderRow[])
      } else {
        setOrders([])
      }

      const productList = ((productResponse as { data?: unknown }).data || []) as ProductRow[]
      setProducts(productList)

      const coachIds = Array.from(new Set(productList.map((product) => product.coach_id).filter(Boolean) as string[]))
      if (coachIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', coachIds)
        const nameMap: Record<string, string> = {}
        const coachProfiles = (profiles || []) as ProfileRow[]
        coachProfiles.forEach((profile) => {
          const displayName = toDisplayName(profile.full_name, profile.email)
          if (displayName) {
            nameMap[profile.id] = displayName
          }
        })
        setCoachNames(nameMap)
      } else {
        setCoachNames({})
      }

      setLoading(false)
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [currentUserId, supabase])

  useEffect(() => {
    let mounted = true
    const signMedia = async () => {
      const urlMap: Record<string, string> = {}
      for (const product of products) {
        if (!product.media_url) continue
        if (product.media_url.startsWith('http')) {
          urlMap[product.id] = product.media_url
          continue
        }
        const { data } = await supabase.storage
          .from(PRODUCT_MEDIA_BUCKET)
          .createSignedUrl(product.media_url, 60 * 30)
        if (data?.signedUrl) {
          urlMap[product.id] = data.signedUrl
        }
      }
      if (mounted) {
        setMediaUrls(urlMap)
      }
    }
    if (products.length > 0) {
      signMedia()
    } else {
      setMediaUrls({})
    }
    return () => {
      mounted = false
    }
  }, [products, supabase])


  const activeOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const status = String(order.status || '').toLowerCase()
        const fulfillment = String(order.fulfillment_status || '').toLowerCase()
        return status.includes('paid') || status.includes('active') || status.includes('scheduled') || fulfillment === 'delivered'
      })
      .slice(0, 3)
  }, [orders])

  const orderHistory = useMemo(() => {
    return orders.slice(0, 3)
  }, [orders])

  const normalizedProducts = useMemo(() => {
    return products
      .filter((product) => (product.status || '').toLowerCase() !== 'draft')
      .map((product) => ({
        ...product,
        format: (product.format || product.type || product.category || 'digital')?.toLowerCase(),
        creator_type: product.creator_type || (product.coach_id ? 'coach' : 'org'),
      }))
  }, [products])

  const sports = useMemo(() => {
    return Array.from(new Set(normalizedProducts.map((product) => product.sport).filter(Boolean) as string[]))
  }, [normalizedProducts])

  const featuredProducts = useMemo(() => {
    return normalizedProducts.filter((product) => product.featured).slice(0, 3)
  }, [normalizedProducts])

  const filteredListings = useMemo(() => {
    const query = search.trim().toLowerCase()
    const now = Date.now()
    const list = normalizedProducts.filter((product) => {
      if (sportFilter !== 'all' && product.sport !== sportFilter) return false
      if (formatFilter !== 'all' && (product.format || '') !== formatFilter) return false
      if (creatorFilter === 'coach' && product.creator_type !== 'coach') return false
      if (creatorFilter === 'org' && product.creator_type !== 'org') return false
      const price = getPriceValue(product)
      if (priceFilter === 'under-50' && price >= 50) return false
      if (priceFilter === '50-100' && (price < 50 || price > 100)) return false
      if (priceFilter === '100-200' && (price < 100 || price > 200)) return false
      if (priceFilter === '200-plus' && price < 200) return false
      if (availabilityFilter !== 'all') {
        const dateValue = product.next_available ? new Date(product.next_available).getTime() : now
        if (availabilityFilter === 'now' && dateValue > now) return false
        if (availabilityFilter === '7' && dateValue > now + 7 * 86400000) return false
        if (availabilityFilter === '14' && dateValue > now + 14 * 86400000) return false
        if (availabilityFilter === '30' && dateValue > now + 30 * 86400000) return false
      }
      if (query) {
        const creator = resolveCreatorName(product, coachNames)
        const haystack = `${product.title || product.name || ''} ${product.best_for || ''} ${product.sport || ''} ${creator} ${
          (product.tags || []).join(' ')
        }`.toLowerCase()
        return haystack.includes(query)
      }
      return true
    })

    const sorted = [...list]
    if (sortBy === 'price-low') {
      sorted.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b))
    } else if (sortBy === 'price-high') {
      sorted.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a))
    } else if (sortBy === 'newest') {
      sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    } else if (sortBy === 'rating') {
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    } else {
      sorted.sort((a, b) => (b.purchases_30d || 0) - (a.purchases_30d || 0))
    }
    return sorted
  }, [
    normalizedProducts,
    search,
    sportFilter,
    formatFilter,
    priceFilter,
    creatorFilter,
    availabilityFilter,
    sortBy,
    coachNames,
  ])

  useEffect(() => {
    setVisibleCount(9)
  }, [search, sportFilter, formatFilter, priceFilter, creatorFilter, availabilityFilter, sortBy])

  const visibleListings = useMemo(
    () => filteredListings.slice(0, visibleCount),
    [filteredListings, visibleCount]
  )
  const canLoadMore = visibleCount < filteredListings.length

  const savedListings = useMemo(() => {
    return savedIds.map((id) => normalizedProducts.find((product) => product.id === id)).filter(Boolean) as ProductRow[]
  }, [savedIds, normalizedProducts])

  const recentlyViewedListings = useMemo(() => {
    return recentlyViewed
      .map((id) => normalizedProducts.find((product) => product.id === id))
      .filter(Boolean) as ProductRow[]
  }, [recentlyViewed, normalizedProducts])

  const compareListings = useMemo(() => {
    return compareIds.map((id) => normalizedProducts.find((product) => product.id === id)).filter(Boolean) as ProductRow[]
  }, [compareIds, normalizedProducts])

  const quickViewProduct = useMemo(() => {
    return normalizedProducts.find((product) => product.id === quickViewId) || null
  }, [normalizedProducts, quickViewId])

  const cartCount = useMemo(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0)
  }, [cartItems])

  const cartSubtotal = useMemo(() => {
    return cartItems.reduce((total, item) => total + item.price * item.quantity, 0)
  }, [cartItems])

  const trackViewed = (productId: string) => {
    setRecentlyViewed((prev) => {
      const next = [productId, ...prev.filter((id) => id !== productId)].slice(0, 6)
      return next
    })
  }

  const toggleSaved = (productId: string) => {
    setSavedIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]))
  }

  const toggleCompare = (productId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(productId)) return prev.filter((id) => id !== productId)
      if (prev.length >= 3) {
        setNotice('Compare up to 3 items at a time.')
        return prev
      }
      return [...prev, productId]
    })
  }

  const handleSearchCommit = (value: string) => {
    const cleaned = value.trim()
    if (!cleaned) return
    setRecentSearches((prev) => [cleaned, ...prev.filter((item) => item !== cleaned)].slice(0, 5))
  }

  const addToCart = (product: ProductRow) => {
    const priceValue = getEffectivePrice(product)
    const title = product.title || product.name || 'Product'
    const creator = resolveCreatorName(product, coachNames)
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
          mediaUrl: mediaUrls[product.id] || product.media_url || undefined,
          format: product.format,
          duration: product.duration,
          creator,
          quantity: 1,
        },
      ]
    })
    setNotice(`${title} added to cart.`)
  }

  const resetFilters = () => {
    setSearch('')
    setSportFilter('all')
    setFormatFilter('all')
    setPriceFilter('all')
    setCreatorFilter('all')
    setAvailabilityFilter('all')
    setSortBy('relevance')
  }

  const renderListingCard = (item: ProductRow, variant: 'default' | 'featured' = 'default') => {
    const title = item.title || item.name || 'Product'
    const creatorName = resolveCreatorName(item, coachNames)
    const creatorLabel = item.creator_type === 'org' ? 'Organization' : 'Coach'
    const basePriceValue = getPriceValue(item)
    const salePriceValue =
      item.sale_price !== null && item.sale_price !== undefined ? parseAmount(item.sale_price) : null
    const showSale = salePriceValue !== null && salePriceValue > 0 && salePriceValue < basePriceValue
    const price = formatCurrency(showSale ? salePriceValue : basePriceValue)
    const rating = item.rating || 0
    const reviews = item.review_count || 0
    const highlight = item.featured ? 'border-[#191919]' : 'border-[#dcdcdc]'
    const cardPadding = variant === 'featured' ? 'p-5' : 'p-4'
    const imageHeight = variant === 'featured' ? 'h-44' : 'h-40'
    return (
      <div
        key={item.id}
        className={`flex h-full flex-col rounded-3xl border ${highlight} bg-white ${cardPadding} shadow-sm transition hover:border-[#191919]`}
        onClick={() => {
          setQuickViewId(item.id)
          trackViewed(item.id)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            setQuickViewId(item.id)
            trackViewed(item.id)
          }
        }}
      >
        <div className={`relative mb-3 w-full overflow-hidden rounded-2xl ${imageHeight} bg-[#f5f5f5]`}>
          {mediaUrls[item.id] ? (
            <Image
              src={mediaUrls[item.id]}
              alt={title}
              fill
              sizes="(max-width: 1024px) 100vw, 33vw"
              className="object-cover"
            />
          ) : null}
          <div className="absolute left-3 top-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
            {item.discount_label ? (
              <span className="rounded-full bg-[#b80f0a] px-2 py-1">{item.discount_label}</span>
            ) : null}
            {item.bundle ? (
              <span className="rounded-full bg-[#191919] px-2 py-1">Bundle</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[#4a4a4a]">
              {creatorLabel}: {creatorName}
              {item.verified ? (
                <span className="ml-2 rounded-full border border-[#191919] px-2 py-0.5 text-[10px] font-semibold text-[#191919]">
                  Verified
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-lg font-semibold text-[#191919]">{title}</p>
            <p className="text-xs text-[#4a4a4a]">{item.sport || 'Multi-sport'}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                toggleSaved(item.id)
              }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                savedIds.includes(item.id) ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
              }`}
            >
              {savedIds.includes(item.id) ? 'Saved' : 'Save'}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                toggleCompare(item.id)
              }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                compareIds.includes(item.id) ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
              }`}
            >
              {compareIds.includes(item.id) ? 'Compare ✓' : 'Compare'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#4a4a4a]">
          <span className="rounded-full border border-[#dcdcdc] px-2.5 py-1">{(item.format || 'digital').toUpperCase()}</span>
          {item.duration ? (
            <span className="rounded-full border border-[#dcdcdc] px-2.5 py-1">{item.duration}</span>
          ) : null}
          <span className="rounded-full border border-[#dcdcdc] px-2.5 py-1">{formatAvailability(item.next_available)}</span>
        </div>

        <div className="mt-3 text-xs text-[#4a4a4a]">
          <span className="font-semibold text-[#191919]">Best for:</span> {item.best_for || 'General development'}
        </div>

        <div className="mt-2 text-xs text-[#4a4a4a]">
          Rating {rating ? rating.toFixed(1) : '—'} · {reviews} reviews · {item.purchases_30d || 0} purchased (30d)
        </div>

        <div className="mt-auto flex items-center justify-between pt-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-[#191919]">{price}</p>
              {showSale ? (
                <p className="text-sm text-[#6b5f55] line-through">{formatCurrency(basePriceValue)}</p>
              ) : null}
            </div>
            <p className="text-xs text-[#4a4a4a]">{item.price_label || 'per item'}</p>
          </div>
          <Link
            href={`/athlete/marketplace/product/${item.id}`}
            onClick={(event) => {
              event.stopPropagation()
              trackViewed(item.id)
            }}
            className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
          >
            View details
          </Link>
        </div>
      </div>
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Marketplace</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">
              Browse and manage your orders.
            </h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Active orders, history, and products from coaches.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/athlete/marketplace/orders" className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
              View orders
            </Link>
            <Link
              href="/athlete/marketplace/cart"
              className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Cart {cartCount > 0 ? `(${cartCount})` : ''}
            </Link>
            <Link href="/athlete/discover" className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 transition-opacity">
              Discover coaches
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div>
            {notice && (
              <p className="mb-4 text-xs text-[#4a4a4a]">{notice}</p>
            )}
            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="glass-card border border-[#191919] bg-white p-5">
                <h3 className="text-lg font-semibold text-[#191919]">Active orders</h3>
                <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
                  {loading ? (
                    <LoadingState label="Loading orders..." />
                  ) : activeOrders.length === 0 ? (
                    <EmptyState title="No active orders yet." description="Browse the marketplace to get started." />
                  ) : (
                    activeOrders.map((order) => {
                      const title = order.title || 'Product'
                      const coachName = order.seller || 'Coach'
                      return (
                        <div
                          key={order.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                        >
                          <div>
                            <p className="font-semibold text-[#191919]">{title}</p>
                            <p>{coachName}</p>
                            <p className="text-xs">{order.status || 'Active'}</p>
                          </div>
                          <Link href="/athlete/marketplace/orders" className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                            Manage
                          </Link>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[#191919]">Order history</h3>
                  <Link href="/athlete/marketplace/orders" className="text-xs font-semibold text-[#191919] underline">
                    View all
                  </Link>
                </div>
                <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
                  {loading ? (
                    <LoadingState label="Loading history..." />
                  ) : orderHistory.length === 0 ? (
                    <EmptyState title="No orders yet." description="Orders you complete will show up here." />
                  ) : (
                    orderHistory.map((order) => {
                      const title = order.title || 'Product'
                      const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'
                      const amount = formatCurrency(parseAmount(order.amount))
                      return (
                        <div
                          key={order.id}
                          className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                        >
                          <div>
                            <p className="font-semibold text-[#191919]">{title}</p>
                            <p className="text-xs">{date}</p>
                          </div>
                          <strong className="text-[#191919]">{amount}</strong>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </section>

            <section className="mt-10 space-y-6">
              <div className="glass-card border border-[#191919] bg-white p-5 sticky top-6 z-20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[#191919]">Discover marketplace</h3>
                    <p className="mt-1 text-xs text-[#4a4a4a]">Search coaches, plans, clinics, and gear.</p>
                  </div>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    Clear filters
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onBlur={(event) => handleSearchCommit(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleSearchCommit(search)
                      }
                    }}
                    placeholder="Search coaches, clinics, plans, or gear"
                    className="w-full rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
                  />
                  <div className="flex flex-wrap gap-2 text-xs">
                    {['1:1', 'Clinics', 'Plans'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setSearch(chip)
                          if (chip === '1:1') setFormatFilter('session')
                          handleSearchCommit(chip)
                        }}
                        className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        {chip}
                      </button>
                    ))}
                    {recentSearches.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setSearch(chip)}
                        className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#6b5f55] hover:text-[#191919]"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-6">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Sport</span>
                    <select
                      value={sportFilter}
                      onChange={(event) => setSportFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    >
                      <option value="all">All sports</option>
                      {sports.map((sport) => (
                        <option key={sport} value={sport}>
                          {sport}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Format</span>
                    <select
                      value={formatFilter}
                      onChange={(event) => setFormatFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    >
                      <option value="all">All formats</option>
                      <option value="digital">Digital</option>
                      <option value="session">Sessions</option>
                      <option value="physical">Physical</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Price</span>
                    <select
                      value={priceFilter}
                      onChange={(event) => setPriceFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    >
                      <option value="all">Any price</option>
                      <option value="under-50">Under $50</option>
                      <option value="50-100">$50-$100</option>
                      <option value="100-200">$100-$200</option>
                      <option value="200-plus">$200+</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Availability</span>
                    <select
                      value={availabilityFilter}
                      onChange={(event) => setAvailabilityFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    >
                      <option value="all">Any time</option>
                      <option value="now">Available now</option>
                      <option value="7">Next 7 days</option>
                      <option value="14">Next 14 days</option>
                      <option value="30">Next 30 days</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Creator</span>
                    <select
                      value={creatorFilter}
                      onChange={(event) => setCreatorFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    >
                      <option value="all">All creators</option>
                      <option value="coach">Coaches</option>
                      <option value="org">Organizations</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Sort</span>
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="price-low">Price: low to high</option>
                      <option value="price-high">Price: high to low</option>
                      <option value="newest">Newest</option>
                      <option value="rating">Highest rated</option>
                    </select>
                  </label>
                </div>
              </div>

              {featuredProducts.length > 0 ? (
                <div className="glass-card border border-[#191919] bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[#191919]">Featured picks</h3>
                      <p className="text-xs text-[#4a4a4a]">Staff picks based on demand.</p>
                    </div>
                    <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                      {featuredProducts.length} featured
                    </span>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {featuredProducts.map((item) => renderListingCard(item, 'featured'))}
                  </div>
                </div>
              ) : null}

              <div className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#191919]">Marketplace listings</h3>
                    <p className="text-xs text-[#4a4a4a]">Showing {filteredListings.length} results</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 text-sm">
                  {loading ? (
                    <LoadingState label="Loading listings..." />
                  ) : filteredListings.length === 0 ? (
                    <EmptyState title="No matches found." description="Try adjusting your filters or search terms." />
                  ) : (
                    visibleListings.map((item) => renderListingCard(item))
                  )}
                </div>
                {canLoadMore && !loading ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + 9)}
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Load more
                    </button>
                  </div>
                ) : null}
                {cartItems.length > 0 ? (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-[#191919]">Cart subtotal</p>
                      <p className="text-xs text-[#4a4a4a]">{cartCount} items · {formatCurrency(cartSubtotal)}</p>
                    </div>
                    <Link
                      href="/athlete/marketplace/cart"
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                    >
                      View cart
                    </Link>
                  </div>
                ) : null}
              </div>

              {savedListings.length > 0 ? (
                <div className="glass-card border border-[#191919] bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[#191919]">Saved items</h3>
                    <button
                      type="button"
                      onClick={() => setSavedIds([])}
                      className="text-xs font-semibold text-[#191919] underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {savedListings.map((item) => renderListingCard(item))}
                  </div>
                </div>
              ) : null}

              {recentlyViewedListings.length > 0 ? (
                <div className="glass-card border border-[#191919] bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[#191919]">Recently viewed</h3>
                    <button
                      type="button"
                      onClick={() => setRecentlyViewed([])}
                      className="text-xs font-semibold text-[#191919] underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {recentlyViewedListings.map((item) => renderListingCard(item))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
      {compareIds.length > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex w-[90%] max-w-3xl -translate-x-1/2 items-center justify-between gap-3 rounded-3xl border border-[#191919] bg-white px-4 py-3 shadow-lg">
          <div className="text-xs font-semibold text-[#191919]">
            {compareIds.length} selected for compare
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90"
            >
              Compare
            </button>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {compareOpen ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4 py-10">
          <div className="w-full max-w-5xl overflow-y-auto max-h-[80vh] rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Compare</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Compare listings</h2>
              </div>
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close compare"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {compareListings.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                  <p className="text-xs font-semibold text-[#4a4a4a]">{item.sport || 'Multi-sport'}</p>
                  <p className="mt-1 text-lg font-semibold text-[#191919]">{item.title || item.name || 'Product'}</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">{(item.format || 'digital').toUpperCase()}</p>
                  <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#191919]">
                    <span>
                      {formatCurrency(
                        item.sale_price !== null && item.sale_price !== undefined ? parseAmount(item.sale_price) : getPriceValue(item),
                      )}
                    </span>
                    {item.sale_price ? (
                      <span className="text-xs font-normal text-[#6b5f55] line-through">
                        {formatCurrency(getPriceValue(item))}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-[#4a4a4a]">Duration: {item.duration || '—'}</p>
                  <p className="text-xs text-[#4a4a4a]">Availability: {formatAvailability(item.next_available)}</p>
                  <p className="text-xs text-[#4a4a4a]">Rating: {(item.rating || 0).toFixed(1)}</p>
                  <p className="text-xs text-[#4a4a4a]">Best for: {item.best_for || '—'}</p>
                  <p className="mt-2 text-xs text-[#4a4a4a]">Refunds: {item.refund_policy || 'Standard refund policy applies.'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {quickViewProduct ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4 py-10">
          <div className="w-full max-w-5xl rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Quick view</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{quickViewProduct.title || quickViewProduct.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setQuickViewId(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close quick view"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                {mediaUrls[quickViewProduct.id] ? (
                  <Image
                    src={mediaUrls[quickViewProduct.id]}
                    alt={quickViewProduct.title || quickViewProduct.name || 'Product'}
                    width={800}
                    height={448}
                    className="h-56 w-full rounded-3xl object-cover"
                  />
                ) : null}
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">What&apos;s included</p>
                  <ul className="mt-3 space-y-2 text-sm text-[#4a4a4a]">
                    {(quickViewProduct.includes && quickViewProduct.includes.length > 0
                      ? quickViewProduct.includes
                      : ['Personalized plan', 'Coach feedback', 'Progress tracking']
                    ).map((item) => (
                      <li key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Refund policy</p>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    {quickViewProduct.refund_policy || 'Standard refund policy applies. Contact support for exceptions.'}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Summary</p>
                  <div className="mt-2 flex items-center gap-2 text-2xl font-semibold text-[#191919]">
                    <span>
                      {formatCurrency(
                        quickViewProduct.sale_price !== null && quickViewProduct.sale_price !== undefined
                          ? parseAmount(quickViewProduct.sale_price)
                          : getPriceValue(quickViewProduct),
                      )}
                    </span>
                    {quickViewProduct.sale_price ? (
                      <span className="text-sm font-normal text-[#6b5f55] line-through">
                        {formatCurrency(getPriceValue(quickViewProduct))}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[#4a4a4a]">
                    {quickViewProduct.price_label || 'per item'} · Rating {(quickViewProduct.rating || 0).toFixed(1)} ·{' '}
                    {quickViewProduct.review_count || 0} reviews
                  </p>
                  <p className="mt-2 text-xs text-[#4a4a4a]">
                    {formatAvailability(quickViewProduct.next_available)} · {quickViewProduct.duration || 'Flexible'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        addToCart(quickViewProduct)
                      }}
                      disabled={!canTransact}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      Add to cart
                    </button>
                    <Link
                      href="/athlete/marketplace/cart"
                      onClick={() => setQuickViewId(null)}
                      className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      View cart
                    </Link>
                    <Link
                      href={`/athlete/marketplace/product/${quickViewProduct.id}`}
                      onClick={() => {
                        trackViewed(quickViewProduct.id)
                        setQuickViewId(null)
                      }}
                      className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      View details
                    </Link>
                    {quickViewProduct.format === 'session' ? (
                      <Link
                        href={`/athlete/marketplace/checkout/${quickViewProduct.id}`}
                        onClick={() => setQuickViewId(null)}
                        className={`rounded-full border px-4 py-2 font-semibold transition-colors ${
                          canTransact
                            ? 'border-[#191919] text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a]'
                            : 'border-[#dcdcdc] text-[#9a9a9a] pointer-events-none'
                        }`}
                      >
                        Purchase session
                      </Link>
                    ) : null}
                  </div>
                  {needsGuardianApproval && (
                    <p className="mt-2 text-xs text-[#b80f0a]">Guardian approval required to purchase.</p>
                  )}
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Coach bio</p>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    {quickViewProduct.coach_bio || 'Coach bio will appear here once available.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickViewId(null)}
                  className="w-full rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Continue shopping
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
