'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import { useAthleteAccess } from '@/components/AthleteAccessProvider'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

const CART_STORAGE_KEY = 'athlete-marketplace-cart'

type CartItem = {
  id: string
  athlete_profile_id?: string | null
  sub_profile_id?: string | null
  athlete_label?: string | null
  title: string
  price: number
  priceLabel?: string | null
  mediaUrl?: string | null
  format?: string | null
  duration?: string | null
  creator?: string | null
  quantity: number
}

const formatCurrency = (value: number) => {
  return `$${value.toFixed(2).replace(/\.00$/, '')}`
}

export default function AthleteMarketplaceCartPage() {
  const { canTransact, needsGuardianApproval } = useAthleteAccess()
  const { activeSubProfileId, activeAthleteLabel } = useAthleteProfile()
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [checkingOutAll, setCheckingOutAll] = useState(false)
  const [checkoutAllError, setCheckoutAllError] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponOpen, setCouponOpen] = useState(false)
  const [couponValidating, setCouponValidating] = useState(false)
  const [couponDiscount, setCouponDiscount] = useState<{ code: string; amount: number; type: 'fixed' | 'percent'; label: string } | null>(null)
  const [couponError, setCouponError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
    if (storedCart) setCartItems(JSON.parse(storedCart))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems))
  }, [cartItems])

  const visibleCartItems = useMemo(
    () => cartItems.filter((item) => (activeSubProfileId ? (item.athlete_profile_id || item.sub_profile_id) === activeSubProfileId : !(item.athlete_profile_id || item.sub_profile_id))),
    [activeSubProfileId, cartItems],
  )

  const subtotal = useMemo(() => {
    return visibleCartItems.reduce((total, item) => total + item.price * item.quantity, 0)
  }, [visibleCartItems])

  const discountAmount = useMemo(() => {
    if (!couponDiscount) return 0
    if (couponDiscount.type === 'percent') return Math.round(subtotal * couponDiscount.amount) / 100
    return Math.min(couponDiscount.amount, subtotal)
  }, [couponDiscount, subtotal])

  const handleCheckoutAll = async () => {
    if (checkingOutAll) return
    setCheckingOutAll(true)
    setCheckoutAllError('')
    const syncRes = await fetch('/api/athlete/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart: cartItems }),
    })
    if (!syncRes.ok) {
      setCheckoutAllError('Unable to sync cart. Please try again.')
      setCheckingOutAll(false)
      return
    }
    const response = await fetch('/api/stripe/cart-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athlete_profile_id: activeSubProfileId || null }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.url) {
      setCheckoutAllError(data?.error || 'Unable to start checkout. Please try again.')
      setCheckingOutAll(false)
      return
    }
    window.location.href = data.url
  }

  const handleApplyCoupon = async () => {
    const code = couponCode.trim()
    if (!code) return
    setCouponValidating(true)
    setCouponError('')
    const productIds = visibleCartItems.map((item) => item.id)
    const response = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, product_ids: productIds }),
    })
    const data = await response.json().catch(() => null)
    setCouponValidating(false)
    if (!response.ok || !data?.valid) {
      setCouponError(data?.error || 'Invalid or expired promo code.')
      setCouponDiscount(null)
    } else {
      setCouponDiscount({ code: data.code, amount: data.discount_amount, type: data.discount_type, label: data.label || data.code })
      setCouponError('')
    }
  }

  const updateQuantity = (id: string, quantity: number) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === id && (activeSubProfileId ? (item.athlete_profile_id || item.sub_profile_id) === activeSubProfileId : !(item.athlete_profile_id || item.sub_profile_id))
          ? { ...item, quantity: Math.max(1, quantity) }
          : item,
      ),
    )
  }

  const removeItem = (id: string) => {
    setCartItems((prev) =>
      prev.filter(
        (item) =>
          !(
            item.id === id
            && (activeSubProfileId ? (item.athlete_profile_id || item.sub_profile_id) === activeSubProfileId : !(item.athlete_profile_id || item.sub_profile_id))
          ),
      ),
    )
  }

  const clearCart = () => {
    setCartItems((prev) =>
      prev.filter((item) => (activeSubProfileId ? (item.athlete_profile_id || item.sub_profile_id) !== activeSubProfileId : Boolean(item.athlete_profile_id || item.sub_profile_id))),
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Marketplace</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Your cart</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Review items and proceed to checkout.</p>
          </div>
          <Link
            href="/athlete/marketplace"
            className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
          >
            Continue shopping
          </Link>
        </header>
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#191919]">Cart items</h3>
                {visibleCartItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-xs font-semibold text-[#191919] underline"
                  >
                    Clear cart
                  </button>
                ) : null}
              </div>
              <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
                {visibleCartItems.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#4a4a4a]">
                    No cart items saved for {activeAthleteLabel}. Explore the marketplace to add products.
                  </div>
                ) : (
                  visibleCartItems.map((item) => (
                    <div
                      key={`${item.id}-${item.sub_profile_id || 'main'}`}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        {item.mediaUrl ? (
                          <Image
                            src={item.mediaUrl}
                            alt={item.title}
                            width={80}
                            height={64}
                            className="h-16 w-20 rounded-xl object-cover"
                          />
                        ) : null}
                        <div>
                          <p className="font-semibold text-[#191919]">{item.title}</p>
                          <p className="text-xs font-semibold text-[#191919]">{item.athlete_label || activeAthleteLabel}</p>
                          <p className="text-xs text-[#4a4a4a]">{item.creator || 'Coach'} · {item.format || 'digital'}</p>
                          <p className="text-xs text-[#4a4a4a]">{item.duration || item.priceLabel || 'Flexible'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="rounded-full border border-[#191919] px-2 py-1 font-semibold text-[#191919]"
                          >
                            -
                          </button>
                          <span className="min-w-[24px] text-center text-sm font-semibold text-[#191919]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="rounded-full border border-[#191919] px-2 py-1 font-semibold text-[#191919]"
                          >
                            +
                          </button>
                        </div>
                        <p className="text-sm font-semibold text-[#191919]">
                          {formatCurrency(item.price * item.quantity)}
                        </p>
                        <Link
                          href={
                            (item.athlete_profile_id || item.sub_profile_id)
                              ? `/athlete/marketplace/checkout/${item.id}?athlete_profile_id=${encodeURIComponent(item.athlete_profile_id || item.sub_profile_id || '')}`
                              : `/athlete/marketplace/checkout/${item.id}`
                          }
                          className={`rounded-full px-4 py-2 text-xs font-semibold ${
                            canTransact
                              ? 'bg-[#b80f0a] text-white hover:opacity-90'
                              : 'bg-[#dcdcdc] text-[#9a9a9a] pointer-events-none'
                          }`}
                        >
                          Checkout
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
            {needsGuardianApproval && (
              <p className="mt-3 text-xs text-[#b80f0a]">Guardian approval required to checkout.</p>
            )}

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#191919]">Order summary</h3>
              </div>
              <div className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#191919]">{formatCurrency(subtotal)}</span>
                </div>
                {couponDiscount && (
                  <div className="flex items-center justify-between text-green-700">
                    <span>Promo: {couponDiscount.label}</span>
                    <span className="font-semibold">-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-[#dcdcdc] pt-2">
                  <span>Total</span>
                  <span className="font-semibold text-[#191919]">{formatCurrency(Math.max(0, subtotal - discountAmount))}</span>
                </div>

                {visibleCartItems.length > 1 && canTransact && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleCheckoutAll}
                      disabled={checkingOutAll}
                      className="w-full rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                      aria-label="Checkout"
                    >
                      {checkingOutAll ? 'Redirecting to checkout…' : `Checkout all ${visibleCartItems.length} items`}
                    </button>
                    {checkoutAllError && (
                      <p className="mt-1 text-xs text-[#b80f0a]">{checkoutAllError}</p>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setCouponOpen((prev) => !prev)}
                    className="text-xs font-semibold text-[#4a4a4a] underline hover:text-[#191919]"
                  >
                    {couponOpen ? 'Hide promo code' : 'Have a promo code?'}
                  </button>
                  {couponOpen && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="Enter code"
                        className="flex-1 rounded-full border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        disabled={couponValidating || !couponCode.trim()}
                        className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919] disabled:opacity-50 hover:bg-[#191919] hover:text-white transition-colors"
                      >
                        {couponValidating ? 'Checking…' : 'Apply'}
                      </button>
                      {couponDiscount && (
                        <button
                          type="button"
                          onClick={() => { setCouponDiscount(null); setCouponCode('') }}
                          className="text-xs font-semibold text-[#b80f0a] underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                  {couponError && <p className="mt-1 text-xs text-[#b80f0a]">{couponError}</p>}
                </div>

              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
