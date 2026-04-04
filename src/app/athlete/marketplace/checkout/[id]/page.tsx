'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { useAthleteAccess } from '@/components/AthleteAccessProvider'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import {
  guardianPendingMessage,
  isGuardianApprovalApiError,
  requestGuardianApproval,
} from '@/lib/guardianApprovalClient'

type ProductRow = {
  id: string
  title?: string | null
  name?: string | null
  type?: string | null
  category?: string | null
  price?: number | string | null
  price_cents?: number | null
  status?: string | null
  coach_id?: string | null
  org_id?: string | null
  media_url?: string | null
  description?: string | null
  inventory_count?: number | null
  shipping_required?: boolean | null
  shipping_notes?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
}

const PRODUCT_MEDIA_BUCKET = 'product-media'
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

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

export default function MarketplaceCheckoutPage() {
  const supabase = createClientComponentClient()
  const { canTransact, needsGuardianApproval } = useAthleteAccess()
  const params = useParams()
  const router = useRouter()
  const productId = typeof params?.id === 'string' ? params.id : ''

  const [product, setProduct] = useState<ProductRow | null>(null)
  const [coachName, setCoachName] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [placing, setPlacing] = useState(false)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [paymentReady, setPaymentReady] = useState(false)
  const [shippingAddress, setShippingAddress] = useState('')

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
          .select('id, full_name')
          .eq('id', row.coach_id)
          .single()
        if (profile && mounted) {
          setCoachName((profile as ProfileRow).full_name || '')
        }
      } else if (row?.org_id) {
        const { data: orgSettings } = await supabase
          .from('org_settings')
          .select('org_name')
          .eq('org_id', row.org_id)
          .maybeSingle()
        const orgSettingRow = (orgSettings || null) as { org_name?: string | null } | null
        if (mounted) {
          setCoachName(orgSettingRow?.org_name || '')
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

  const amountCents = useMemo(() => {
    if (!product) return 0
    const raw = product.price_cents ? product.price_cents / 100 : parseAmount(product.price)
    return Math.round(raw * 100)
  }, [product])

  useEffect(() => {
    const createIntent = async () => {
      if (!product || !currentUserId || amountCents <= 0) return
      setPaymentReady(false)
      setNotice('')
      if (needsGuardianApproval) {
        const targetType = product.org_id ? 'org' : product.coach_id ? 'coach' : null
        const targetId = product.org_id || product.coach_id || ''
        if (targetType && targetId) {
          const approvalResult = await requestGuardianApproval({
            target_type: targetType,
            target_id: targetId,
            target_label: product.title || product.name || 'this seller',
            scope: 'transactions',
          })
          if (!approvalResult.ok) {
            setNotice(approvalResult.error || 'Unable to request guardian approval.')
            return
          }
          if (approvalResult.status !== 'approved') {
            setNotice(guardianPendingMessage)
            return
          }
        }
      }
      const response = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountCents,
          currency: 'usd',
          metadata: {
            productId: product.id,
            athleteId: currentUserId,
            coachId: product.coach_id,
            orgId: product.org_id,
          },
        }),
      })
      const data = await response.json()
      if (data?.clientSecret) {
        setClientSecret(data.clientSecret)
        setPaymentReady(true)
      } else {
        if (isGuardianApprovalApiError(data)) {
          setNotice(data?.error || guardianPendingMessage)
          return
        }
        setNotice(data?.error || 'Unable to initialize payment.')
      }
    }
    createIntent()
  }, [amountCents, currentUserId, needsGuardianApproval, product])

  const handlePlaceOrder = async (paymentIntentId: string) => {
    if (!product || !currentUserId) {
      setNotice('You must be signed in to place an order.')
      return
    }
    if (product.shipping_required && !shippingAddress.trim()) {
      setNotice('Add a shipping address to continue.')
      return
    }
    setPlacing(true)
    setNotice('')
    const response = await fetch('/api/marketplace/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        payment_intent_id: paymentIntentId,
        shipping_address: shippingAddress.trim() || null,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      if (isGuardianApprovalApiError(data)) {
        setNotice(data?.error || guardianPendingMessage)
        setPlacing(false)
        return
      }
      setNotice(data?.error || 'Payment succeeded but order creation failed.')
      setPlacing(false)
      return
    }

    setPlacing(false)
    router.push('/athlete/marketplace/orders')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Checkout</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Confirm your purchase</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Review details before placing your order.</p>
          </div>
          <Link href="/athlete/marketplace" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
            Back to marketplace
          </Link>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="glass-card border border-[#191919] bg-white p-6">
            {loading ? (
              <p className="text-sm text-[#4a4a4a]">Loading product...</p>
            ) : !product ? (
              <p className="text-sm text-[#4a4a4a]">Product not found.</p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  {mediaUrl && (
                    <Image
                      src={mediaUrl}
                      alt={product.title || product.name || 'Product'}
                      width={800}
                      height={384}
                      className="h-48 w-full rounded-2xl object-cover"
                    />
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Product</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                      {product.title || product.name || 'Product'}
                    </h2>
                    <p className="mt-2 text-sm text-[#4a4a4a]">{product.description || 'No description provided.'}</p>
                  </div>
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                    <p className="font-semibold text-[#191919]">{product.org_id ? 'Organization' : 'Coach'}</p>
                    <p className="text-[#4a4a4a]">{coachName || (product.org_id ? 'Organization' : 'Coach')}</p>
                  </div>
                  {product.shipping_required ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Shipping</p>
                      <textarea
                        rows={3}
                        value={shippingAddress}
                        onChange={(event) => setShippingAddress(event.target.value)}
                        className="mt-3 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        placeholder="Shipping address"
                      />
                      {product.shipping_notes ? (
                        <p className="mt-2 text-xs text-[#4a4a4a]">{product.shipping_notes}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Order summary</p>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-[#4a4a4a]">Item</span>
                      <span className="font-semibold text-[#191919]">{formatCurrency(product.price_cents ? product.price_cents / 100 : product.price)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-[#4a4a4a]">Service fee</span>
                      <span className="font-semibold text-[#191919]">Included</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-[#dcdcdc] pt-3 text-sm">
                      <span className="font-semibold text-[#191919]">Total</span>
                      <span className="font-semibold text-[#191919]">{formatCurrency(product.price_cents ? product.price_cents / 100 : product.price)}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payment method</p>
                    {!canTransact ? (
                      <p className="mt-3 text-xs text-[#b80f0a]">Guardian approval required to checkout.</p>
                    ) : !stripePromise ? (
                      <p className="mt-3 text-xs text-[#4a4a4a]">Stripe key missing. Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.</p>
                    ) : paymentReady && clientSecret ? (
                      <Elements stripe={stripePromise} options={{ clientSecret }}>
                        <StripeCheckoutForm onSuccess={handlePlaceOrder} clientSecret={clientSecret} />
                      </Elements>
                    ) : (
                      <p className="mt-3 text-xs text-[#4a4a4a]">Preparing secure checkout...</p>
                    )}
                  </div>

                  {notice && <p className="text-xs text-[#4a4a4a]">{notice}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
