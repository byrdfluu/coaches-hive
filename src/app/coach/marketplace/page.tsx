'use client'

import Link from 'next/link'
import { useMemo, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import { isActiveCoachProductStatus, normalizeCoachProductStatus } from '@/lib/coachMarketplaceStatus'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { FeeTier, getFeePercentage, resolveProductCategory } from '@/lib/platformFees'

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
  price_label?: string | null
  format?: string | null
  duration?: string | null
  next_available?: string | null
  includes?: string[] | null
  refund_policy?: string | null
  description?: string | null
  media_url?: string | null
  status?: string | null
  coach_id?: string | null
  created_at?: string | null
}

type OrderRow = {
  id: string
  product_id?: string | null
  coach_id?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  status?: string | null
  created_at?: string | null
}

type FeeRuleRow = {
  tier: string
  category: string
  percentage: number
}

type CoachPlanRow = {
  coach_id: string
  tier: string
}

type DemandSignal = {
  label: string
  score?: number
}

type RevenueDetailModal =
  | { type: 'month'; scope: 'all' | 'report' }
  | { type: 'product'; productId: string; scope: 'all' | 'report' }
  | { type: 'year'; category: 'revenue' | 'net_revenue' | 'top_product' }
  | null

type ProductMetrics = {
  revenue: number
  orders: number
  lastOrderAt: string | null
}

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const toMonthKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
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

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const getCurrentMonthKey = () => toMonthKey(new Date())

const defaultDemandSignals = [
  'Speed mechanics',
  'Return-to-play',
  'Strength plans',
  'Remote video review',
  'Team packages',
  'Weekly check-ins',
]

export default function CoachMarketplacePage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [demandSignals, setDemandSignals] = useState<string[]>(defaultDemandSignals)
  const [detailModal, setDetailModal] = useState<RevenueDetailModal>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null)
  const [coachTier, setCoachTier] = useState<FeeTier>('starter')
  const [feeRules, setFeeRules] = useState<FeeRuleRow[]>([])
  const [publishingProductId, setPublishingProductId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignProductId, setAssignProductId] = useState('')
  const [assignNote, setAssignNote] = useState('')
  const [assignNotice, setAssignNotice] = useState('')
  const [currentMonthKey, setCurrentMonthKey] = useState('')
  const [reportMonth, setReportMonth] = useState('')
  const [isOrgOnlyCoach, setIsOrgOnlyCoach] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  const openMonthSummary = () => setDetailModal({ type: 'month', scope: 'report' })
  const openProductDetail = (productId: string, scope: 'all' | 'report' = 'all') =>
    setDetailModal({ type: 'product', productId, scope })
  const openYearBreakdown = (category: 'revenue' | 'net_revenue' | 'top_product') =>
    setDetailModal({ type: 'year', category })

  const handlePublish = async (productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product) {
      setToast('Product not found. Refresh and try again.')
      return
    }

    setPublishingProductId(productId)
    try {
      const response = await fetch(`/api/coach/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: product.title || product.name || '',
          category: product.category || product.type || null,
          type: product.category || product.type || null,
          status: 'published',
          price: product.price_cents ? product.price_cents / 100 : product.price,
          sale_price: product.sale_price ?? null,
          discount_label: product.discount_label ?? null,
          price_label: product.price_label ?? null,
          format: product.format ?? null,
          duration: product.duration ?? null,
          next_available: product.next_available ?? null,
          includes: product.includes ?? null,
          refund_policy: product.refund_policy ?? null,
          description: product.description ?? null,
          media_url: product.media_url ?? null,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setToast(payload?.error || 'Unable to publish product. Please complete the required product details.')
        return
      }

      setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, status: 'published' } : p))
      setToast('Product published.')
    } finally {
      setPublishingProductId(null)
    }
  }

  const handleDelete = async (productId: string) => {
    const res = await fetch(`/api/coach/products/${productId}`, { method: 'DELETE' })
    if (!res.ok) {
      setToast('Unable to delete product. Please try again.')
      setDeleteConfirmId(null)
      return
    }
    setProducts((prev) => prev.filter((p) => p.id !== productId))
    setDeleteConfirmId(null)
    setToast('Product deleted.')
  }

  useEffect(() => {
    const monthKey = getCurrentMonthKey()
    setCurrentMonthKey(monthKey)
    setReportMonth((prev) => prev || monthKey)
  }, [])

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
    const loadData = async () => {
      setLoading(true)
      setNotice('')

      const { data: productRows, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('coach_id', currentUserId)
        .order('created_at', { ascending: false })

      if (productError) {
        setNotice('Unable to load products. Check your Supabase table columns.')
      }

      const { data: orderRows } = await supabase
        .from('orders')
        .select('*')
        .eq('coach_id', currentUserId)
        .order('created_at', { ascending: false })

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('stripe_account_id')
        .eq('id', currentUserId)
        .maybeSingle()

      const { data: planRow } = await supabase
        .from('coach_plans')
        .select('coach_id, tier')
        .eq('coach_id', currentUserId)
        .maybeSingle()

      const { data: feeRuleRows } = await supabase
        .from('platform_fee_rules')
        .select('tier, category, percentage')
        .eq('active', true)

      const { data: orgMemberRow } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', currentUserId)
        .maybeSingle()

      if (!mounted) return

      setProducts((productRows || []) as ProductRow[])
      setOrders((orderRows || []) as OrderRow[])
      if (profileRow?.stripe_account_id) {
        setStripeConnected(true)
      } else {
        try {
          const verifyRes = await fetch('/api/stripe/connect/verify')
          if (!mounted) return
          if (verifyRes.ok) {
            const verifyPayload = await verifyRes.json().catch(() => null)
            setStripeConnected(Boolean(verifyPayload?.connected))
          } else {
            setStripeConnected(false)
          }
        } catch {
          if (!mounted) return
          setStripeConnected(false)
        }
      }
      if (planRow?.tier) {
        setCoachTier(planRow.tier as FeeTier)
      }
      setFeeRules((feeRuleRows || []) as FeeRuleRow[])
      const isOrgOnly = !planRow?.tier && Boolean(orgMemberRow?.org_id)
      setIsOrgOnlyCoach(isOrgOnly)
      if (isOrgOnly) setUpgradeModalOpen(true)
      setLoading(false)
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [currentUserId, supabase])


  useEffect(() => {
    let active = true
    const loadDemandSignals = async () => {
      try {
        const response = await fetch('/api/demand-signals?limit=6')
        if (!response.ok) throw new Error('Unable to load demand signals')
        const payload = await response.json()
        const labels = (payload.signals || [])
          .map((signal: DemandSignal) => signal.label)
          .filter(Boolean)
        if (!active) return
        setDemandSignals(labels.length ? labels : defaultDemandSignals)
      } catch (error) {
        if (active) setDemandSignals(defaultDemandSignals)
      }
    }
    loadDemandSignals()
    return () => {
      active = false
    }
  }, [])

  const productSales = useMemo(() => {
    const map = new Map<string, number>()
    orders.forEach((order) => {
      if (!order.product_id) return
      map.set(order.product_id, (map.get(order.product_id) || 0) + 1)
    })
    return map
  }, [orders])

  const productMap = useMemo(() => {
    const map = new Map<string, ProductRow>()
    products.forEach((product) => map.set(product.id, product))
    return map
  }, [products])

  const productMetricsAll = useMemo(() => {
    const map = new Map<string, ProductMetrics>()
    orders.forEach((order) => {
      if (!order.product_id) return
      const entry = map.get(order.product_id) || { revenue: 0, orders: 0, lastOrderAt: null }
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      entry.revenue += amount
      entry.orders += 1
      if (order.created_at) {
        if (!entry.lastOrderAt || new Date(order.created_at) > new Date(entry.lastOrderAt)) {
          entry.lastOrderAt = order.created_at
        }
      }
      map.set(order.product_id, entry)
    })
    return map
  }, [orders])

  const reportMonthOptions = useMemo(() => {
    const keys = new Set<string>()
    orders.forEach((order) => {
      if (!order.created_at) return
      keys.add(toMonthKey(new Date(order.created_at)))
    })
    if (currentMonthKey) keys.add(currentMonthKey)
    return Array.from(keys).sort().reverse()
  }, [orders, currentMonthKey])

  useEffect(() => {
    if (!currentMonthKey) return
    if (!reportMonthOptions.includes(reportMonth)) {
      setReportMonth(reportMonthOptions[0] || currentMonthKey)
    }
  }, [reportMonthOptions, reportMonth, currentMonthKey])

  const reportMonthLabel = formatMonthLabel(reportMonth)
  const reportYearLabel = reportMonth.split('-')[0] || new Date().getFullYear().toString()
  const reportYear = Number.parseInt(reportYearLabel, 10) || new Date().getFullYear()

  const ordersForReportMonth = useMemo(() => {
    return orders.filter((order) => {
      if (!order.created_at) return false
      return toMonthKey(new Date(order.created_at)) === reportMonth
    })
  }, [orders, reportMonth])

  const productMetricsReport = useMemo(() => {
    const map = new Map<string, ProductMetrics>()
    ordersForReportMonth.forEach((order) => {
      if (!order.product_id) return
      const entry = map.get(order.product_id) || { revenue: 0, orders: 0, lastOrderAt: null }
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      entry.revenue += amount
      entry.orders += 1
      if (order.created_at) {
        if (!entry.lastOrderAt || new Date(order.created_at) > new Date(entry.lastOrderAt)) {
          entry.lastOrderAt = order.created_at
        }
      }
      map.set(order.product_id, entry)
    })
    return map
  }, [ordersForReportMonth])

  const revenueReportMonth = useMemo(() => {
    return ordersForReportMonth.reduce((sum, order) => {
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      return sum + amount
    }, 0)
  }, [ordersForReportMonth])

  const platformFeesReportMonth = useMemo(() => {
    return ordersForReportMonth.reduce((sum, order) => {
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      const product = order.product_id ? productMap.get(order.product_id) : undefined
      const category = resolveProductCategory(product?.type || product?.category)
      const percent = getFeePercentage(coachTier, category, feeRules)
      return sum + amount * (percent / 100)
    }, 0)
  }, [ordersForReportMonth, productMap, coachTier, feeRules])

  const netRevenueReportMonth = useMemo(() => {
    return revenueReportMonth - platformFeesReportMonth
  }, [revenueReportMonth, platformFeesReportMonth])

  const averageOrderValueReportMonth = useMemo(() => {
    if (ordersForReportMonth.length === 0) return 0
    return revenueReportMonth / ordersForReportMonth.length
  }, [ordersForReportMonth, revenueReportMonth])

  const latestOrderReportMonth = useMemo(() => {
    let latest: string | null = null
    ordersForReportMonth.forEach((order) => {
      if (!order.created_at) return
      if (!latest || new Date(order.created_at) > new Date(latest)) {
        latest = order.created_at
      }
    })
    return latest
  }, [ordersForReportMonth])

  const yearMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) =>
      `${reportYear}-${String(index + 1).padStart(2, '0')}`
    )
  }, [reportYear])

  const ordersForReportYear = useMemo(() => {
    return orders.filter((order) => {
      if (!order.created_at) return false
      return new Date(order.created_at).getFullYear() === reportYear
    })
  }, [orders, reportYear])

  const revenueReportYear = useMemo(() => {
    return ordersForReportYear.reduce((sum, order) => {
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      return sum + amount
    }, 0)
  }, [ordersForReportYear])

  const platformFeesReportYear = useMemo(() => {
    return ordersForReportYear.reduce((sum, order) => {
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      const product = order.product_id ? productMap.get(order.product_id) : undefined
      const category = resolveProductCategory(product?.type || product?.category)
      const percent = getFeePercentage(coachTier, category, feeRules)
      return sum + amount * (percent / 100)
    }, 0)
  }, [ordersForReportYear, productMap, coachTier, feeRules])

  const netRevenueReportYear = useMemo(() => {
    return revenueReportYear - platformFeesReportYear
  }, [revenueReportYear, platformFeesReportYear])

  const revenueByMonth = useMemo(() => {
    const map = new Map<string, number>()
    yearMonths.forEach((key) => map.set(key, 0))
    ordersForReportYear.forEach((order) => {
      if (!order.created_at) return
      const key = toMonthKey(new Date(order.created_at))
      map.set(key, (map.get(key) || 0) + parseAmount(order.amount ?? order.total ?? order.price))
    })
    return map
  }, [ordersForReportYear, yearMonths])

  const netRevenueByMonth = useMemo(() => {
    const map = new Map<string, number>()
    yearMonths.forEach((key) => map.set(key, 0))
    ordersForReportYear.forEach((order) => {
      if (!order.created_at) return
      const key = toMonthKey(new Date(order.created_at))
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      const product = order.product_id ? productMap.get(order.product_id) : undefined
      const category = resolveProductCategory(product?.type || product?.category)
      const percent = getFeePercentage(coachTier, category, feeRules)
      const netAmount = amount - amount * (percent / 100)
      map.set(key, (map.get(key) || 0) + netAmount)
    })
    return map
  }, [ordersForReportYear, yearMonths, productMap, coachTier, feeRules])

  const topProductByMonth = useMemo(() => {
    const monthMap = new Map<string, { id: string | null; name: string; revenue: number }>()
    yearMonths.forEach((key) => monthMap.set(key, { id: null, name: '—', revenue: 0 }))
    const revenueMap = new Map<string, Map<string, number>>()
    ordersForReportYear.forEach((order) => {
      if (!order.created_at || !order.product_id) return
      const monthKey = toMonthKey(new Date(order.created_at))
      const monthProducts = revenueMap.get(monthKey) || new Map<string, number>()
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      monthProducts.set(order.product_id, (monthProducts.get(order.product_id) || 0) + amount)
      revenueMap.set(monthKey, monthProducts)
    })
    revenueMap.forEach((productRevenue, monthKey) => {
      let topId: string | null = null
      let topAmount = 0
      productRevenue.forEach((amount, id) => {
        if (amount > topAmount) {
          topAmount = amount
          topId = id
        }
      })
      const product = products.find((item) => item.id === topId)
      monthMap.set(monthKey, {
        id: topId,
        name: product?.title || product?.name || '—',
        revenue: topAmount,
      })
    })
    return monthMap
  }, [ordersForReportYear, yearMonths, products])

  const topProductReportSummary = useMemo(() => {
    const revenueByProduct = new Map<string, number>()
    ordersForReportMonth.forEach((order) => {
      if (!order.product_id) return
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      revenueByProduct.set(order.product_id, (revenueByProduct.get(order.product_id) || 0) + amount)
    })
    let topId: string | null = null
    let topAmount = 0
    revenueByProduct.forEach((amount, id) => {
      if (amount > topAmount) {
        topAmount = amount
        topId = id
      }
    })
    const product = products.find((item) => item.id === topId)
    return {
      id: topId,
      name: product?.title || product?.name || '—',
      revenue: topAmount,
    }
  }, [ordersForReportMonth, products])

  const topProductReportYearSummary = useMemo(() => {
    const revenueByProduct = new Map<string, number>()
    ordersForReportYear.forEach((order) => {
      if (!order.product_id) return
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      revenueByProduct.set(order.product_id, (revenueByProduct.get(order.product_id) || 0) + amount)
    })
    let topId: string | null = null
    let topAmount = 0
    revenueByProduct.forEach((amount, id) => {
      if (amount > topAmount) {
        topAmount = amount
        topId = id
      }
    })
    const product = products.find((item) => item.id === topId)
    return {
      id: topId,
      name: product?.title || product?.name || '—',
      revenue: topAmount,
    }
  }, [ordersForReportYear, products])

  const metrics = useMemo(() => {
    const activeOffers = products.filter((product) => isActiveCoachProductStatus(product.status)).length
    const drafts = products.filter((product) => normalizeCoachProductStatus(product.status) === 'draft').length
    const revenueLabel = `Revenue ${reportYearLabel}`
    const topProductLabel = `Top product ${reportYearLabel}`
    const netRevenueLabel = `Est. net revenue ${reportYearLabel}`
    return [
      { key: 'active_offers', label: 'Active offers', value: String(activeOffers) },
      { key: 'drafts', label: 'Drafts', value: String(drafts) },
      { key: 'revenue', label: revenueLabel, value: formatCurrency(revenueReportYear) },
      { key: 'top_product', label: topProductLabel, value: topProductReportYearSummary.name },
      { key: 'net_revenue', label: netRevenueLabel, value: formatCurrency(netRevenueReportYear) },
    ]
  }, [products, reportYearLabel, revenueReportYear, topProductReportYearSummary.name, netRevenueReportYear])

  const selectedProduct = detailModal && detailModal.type === 'product'
    ? productMap.get(detailModal.productId || '')
    : null
  const selectedProductMetrics = detailModal && detailModal.type === 'product'
    ? (detailModal.scope === 'report' ? productMetricsReport : productMetricsAll).get(detailModal.productId || '')
    : null
  const selectedProductTitle = selectedProduct?.title || selectedProduct?.name || 'Product details'
  const selectedProductType = selectedProduct?.category || selectedProduct?.type || 'Product'
  const selectedProductStatus = selectedProduct?.status || 'Draft'
  const selectedProductPrice = selectedProduct?.price_cents
    ? formatCurrency(selectedProduct.price_cents / 100)
    : formatCurrency(selectedProduct?.price)

  const assignParam = (searchParams?.get('assign') || '').trim()
  const assignSlug = assignParam ? slugify(assignParam) : ''
  const assignAthleteName = assignSlug
    ? assignSlug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : ''

  useEffect(() => {
    if (assignSlug) {
      setAssignModalOpen(true)
      setAssignNotice('')
      if (!assignProductId && products.length > 0) {
        setAssignProductId(products[0].id)
      }
    } else {
      setAssignModalOpen(false)
      setAssignProductId('')
      setAssignNote('')
      setAssignNotice('')
    }
  }, [assignSlug, products, assignProductId])

  const closeAssignModal = () => {
    setAssignModalOpen(false)
    setAssignProductId('')
    setAssignNote('')
    setAssignNotice('')
    router.push('/coach/marketplace')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
              Marketplace
            </p>
            <h1 className="display text-3xl font-semibold text-[#191919]">
              Create, publish, and sell your offers.
            </h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Services, packages, and digital resources with tracking and
              payouts.
            </p>
            <p className="mt-2 text-xs text-[#4a4a4a]">
              Note: Physical products must be delivered in person at training sessions.
            </p>
            {stripeConnected === false && (
              <p className="mt-2 text-xs text-[#b80f0a]">
                Connect Stripe in Settings to start receiving payments.
              </p>
            )}
            {stripeConnected === true && (
              <p className="mt-2 text-xs text-emerald-700">
                Stripe connected.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {stripeConnected === null ? (
              <span className="rounded-full border border-[#dcdcdc] px-4 py-2 font-semibold text-[#4a4a4a]">
                Checking Stripe
              </span>
            ) : stripeConnected ? (
              isOrgOnlyCoach ? (
                <button
                  type="button"
                  onClick={() => setUpgradeModalOpen(true)}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white"
                >
                  Upgrade to list
                </button>
              ) : (
                <Link href="/coach/marketplace/create" className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white">
                  Create product
                </Link>
              )
            ) : (
              <Link href="/coach/settings" className="rounded-full border border-[#b80f0a] px-4 py-2 font-semibold text-[#b80f0a]">
                Connect Stripe
              </Link>
            )}
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div>
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {metrics.map(({ key, label, value }) => {
                const content = (
                  <div
                    key={key}
                    className="glass-card border border-[#191919] bg-white p-5"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
                      {label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[#191919]">
                      {value}
                    </p>
                  </div>
                )
                if (key === 'revenue') {
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openYearBreakdown('revenue')}
                      className="block text-left"
                    >
                      {content}
                    </button>
                  )
                }
                if (key === 'top_product') {
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openYearBreakdown('top_product')}
                      className="block text-left"
                    >
                      {content}
                    </button>
                  )
                }
                if (key === 'net_revenue') {
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openYearBreakdown('net_revenue')}
                      className="block text-left"
                    >
                      {content}
                    </button>
                  )
                }
                return content
              })}
            </section>

            <section className="mt-6 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="glass-card border border-[#191919] bg-white p-5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Demand signals</p>
                    <h3 className="mt-2 text-lg font-semibold text-[#191919]">Athletes are searching for</h3>
                  </div>
                  <Link href="/coach/marketplace/create" className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                    Add offer
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3 text-xs text-[#4a4a4a]">
                  {demandSignals.map((item) => (
                    <div key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2">
                      <span className="font-semibold text-[#191919]">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-5 text-sm">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Supply boost</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">Publish a new offer</p>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Listings with photos and clear outcomes convert 2x better.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <Link href="/coach/marketplace/create" className="rounded-full bg-[#b80f0a] px-3 py-1 font-semibold text-white">
                    Create listing
                  </Link>
                  <Link href="/coach/settings" className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                    Update profile
                  </Link>
                </div>
              </div>
            </section>

            <section className="mt-10 grid gap-6">
              <div className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[#191919]">
                    Your products
                  </h3>
                  <button onClick={() => setShowFilters((s) => !s)} className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                    {showFilters ? 'Hide filters' : 'Filter'}
                  </button>
                </div>
                {showFilters && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {['Sessions', 'Plans', 'Digital', 'Physical', 'Drafts'].map((f) => (
                      <span key={f} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {notice && (
                  <p className="mt-3 text-xs text-[#4a4a4a]">{notice}</p>
                )}
                <div className="mt-4 space-y-3">
                  {loading ? (
                    <LoadingState label="Loading products..." />
                  ) : products.length === 0 ? (
                    <EmptyState title="No products yet." description="Create your first offer to start earning." />
                  ) : (
                    products.map((product) => {
                      const title = product.title || product.name || 'Untitled product'
                      const type = product.category || product.type || 'Product'
                      const price = product.price_cents
                        ? formatCurrency(product.price_cents / 100)
                        : formatCurrency(product.price)
                      const status = product.status || 'Draft'
                      const sales = productSales.get(product.id) || 0
                      return (
                        <div
                          key={product.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openProductDetail(product.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openProductDetail(product.id)
                            }
                          }}
                          className="flex flex-col gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm transition hover:border-[#191919] cursor-pointer sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#191919]">
                              {title}
                            </p>
                            <p className="text-xs text-[#4a4a4a]">
                              {type} • {price}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#4a4a4a]">
                            <span className={`rounded-full border px-3 py-1 font-semibold ${status.toLowerCase() === 'published' ? 'border-[#1a7a3c] bg-[#f0faf4] text-[#1a7a3c]' : 'border-[#4a4a4a] text-[#4a4a4a]'}`}>
                              {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
                            </span>
                            <span>{sales} sold</span>
                            {status.toLowerCase() === 'draft' && (
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); handlePublish(product.id) }}
                                disabled={publishingProductId === product.id}
                                className="w-full rounded-full bg-[#b80f0a] px-3 py-1 text-center font-semibold text-white transition hover:bg-[#191919] disabled:cursor-not-allowed disabled:bg-[#b80f0a] disabled:text-white sm:w-auto"
                              >
                                {publishingProductId === product.id ? 'Publishing...' : 'Publish'}
                              </button>
                            )}
                            <Link
                              href={`/coach/marketplace/product/${slugify(title)}/edit?id=${product.id}`}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-center font-semibold text-[#191919] transition hover:bg-[#191919] hover:text-white sm:w-auto"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Edit
                            </Link>
                            {deleteConfirmId === product.id ? (
                              <span className="flex items-center gap-1 text-[#b80f0a]">
                                <span>Delete?</span>
                                <button type="button" onClick={(event) => { event.stopPropagation(); handleDelete(product.id) }} className="font-semibold underline">Yes</button>
                                <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteConfirmId(null) }} className="font-semibold underline text-[#4a4a4a]">No</button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setDeleteConfirmId(product.id) }}
                                className="w-full rounded-full border border-[#dcdcdc] px-3 py-1 text-center font-semibold text-[#4a4a4a] transition hover:border-[#b80f0a] hover:text-[#b80f0a] sm:w-auto"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </section>

            <section className="mt-6">
              <div className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[#191919]">Revenue reports</h3>
                    <p className="mt-1 text-sm text-[#4a4a4a]">Download sales summaries by product.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#191919]">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
                      Month
                    </label>
                    <select
                      value={reportMonth}
                      onChange={(event) => setReportMonth(event.target.value)}
                      className="rounded-full border border-[#191919] bg-white px-3 py-1 text-xs font-semibold text-[#191919]"
                    >
                      {reportMonthOptions.map((monthKey) => (
                        <option key={monthKey} value={monthKey}>
                          {formatMonthLabel(monthKey)}
                        </option>
                      ))}
                    </select>
                    <Link
                      href="/coach/settings#export-center"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Go to export center
                    </Link>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
                  <button
                    type="button"
                    onClick={openMonthSummary}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left transition hover:border-[#191919]"
                  >
                    <p className="font-semibold text-[#191919]">{reportMonthLabel} summary</p>
                    <p className="text-xs">Gross {formatCurrency(revenueReportMonth)} · {ordersForReportMonth.length} orders</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (topProductReportSummary.id) {
                        openProductDetail(topProductReportSummary.id, 'report')
                      }
                    }}
                    disabled={!topProductReportSummary.id}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left transition hover:border-[#191919] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <p className="font-semibold text-[#191919]">Top product</p>
                    <p className="text-xs">{topProductReportSummary.name}</p>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {detailModal ? (
        <div className="fixed inset-0 z-[999] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-4 sm:items-center sm:py-8" onClick={() => setDetailModal(null)}>
          <div
            className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 shadow-xl max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-h-[calc(100dvh-4rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Revenue reports</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {detailModal.type === 'month'
                    ? `${reportMonthLabel} summary`
                    : detailModal.type === 'year'
                      ? `${detailModal.category === 'revenue' ? 'Revenue' : detailModal.category === 'net_revenue' ? 'Net revenue' : 'Top product'} ${reportYearLabel}`
                      : selectedProductTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a]"
              >
                Close
              </button>
            </div>

            {detailModal.type === 'month' ? (
              <div className="mt-5 grid gap-3 text-sm text-[#4a4a4a] md:grid-cols-2">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Gross revenue</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(revenueReportMonth)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Platform fees</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(platformFeesReportMonth)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Net revenue</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(netRevenueReportMonth)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Orders</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{ordersForReportMonth.length}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Avg order value</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(averageOrderValueReportMonth)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Last order</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatShortDate(latestOrderReportMonth)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Top product</p>
                  <div className="mt-2 flex items-center justify-between text-[#191919]">
                    <span className="font-semibold">{topProductReportSummary.name}</span>
                    <span className="text-sm">{formatCurrency(topProductReportSummary.revenue)}</span>
                  </div>
                </div>
              </div>
            ) : detailModal.type === 'year' ? (
              <div className="mt-5 space-y-3 text-sm text-[#4a4a4a]">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Year to date total</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {detailModal.category === 'revenue'
                      ? formatCurrency(revenueReportYear)
                      : detailModal.category === 'net_revenue'
                        ? formatCurrency(netRevenueReportYear)
                        : topProductReportYearSummary.name}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Monthly breakdown</p>
                  <div className="mt-3 space-y-2">
                    {yearMonths.map((monthKey) => {
                      const monthLabel = formatMonthLabel(monthKey)
                      if (detailModal.category === 'revenue') {
                        const value = revenueByMonth.get(monthKey) || 0
                        return (
                          <div key={monthKey} className="flex items-center justify-between text-xs text-[#191919]">
                            <span>{monthLabel}</span>
                            <span className="font-semibold">{formatCurrency(value)}</span>
                          </div>
                        )
                      }
                      if (detailModal.category === 'net_revenue') {
                        const value = netRevenueByMonth.get(monthKey) || 0
                        return (
                          <div key={monthKey} className="flex items-center justify-between text-xs text-[#191919]">
                            <span>{monthLabel}</span>
                            <span className="font-semibold">{formatCurrency(value)}</span>
                          </div>
                        )
                      }
                      const productInfo = topProductByMonth.get(monthKey) || { name: '—', revenue: 0 }
                      return (
                        <div key={monthKey} className="flex items-start justify-between gap-3 text-xs text-[#191919]">
                          <span>{monthLabel}</span>
                          <span className="text-right">
                            <span className="block font-semibold">{productInfo.name}</span>
                            <span className="text-[11px] text-[#4a4a4a]">{formatCurrency(productInfo.revenue)}</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : selectedProduct ? (
              <div className="mt-5 grid gap-3 text-sm text-[#4a4a4a] md:grid-cols-2">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Type</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{selectedProductType}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Status</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{selectedProductStatus}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Price</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{selectedProductPrice}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Orders</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{selectedProductMetrics?.orders || 0}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Revenue</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(selectedProductMetrics?.revenue || 0)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Last sale</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatShortDate(selectedProductMetrics?.lastOrderAt)}</p>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#4a4a4a]">
                Product details are unavailable.
              </div>
            )}
          </div>
        </div>
      ) : null}
      {assignModalOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-10" onClick={closeAssignModal}>
          <div
            className="w-full max-w-3xl rounded-3xl border border-[#191919] bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Assign program</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {assignAthleteName ? `Assign to ${assignAthleteName}` : 'Assign program'}
                </h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">
                  Select an offer to attach to this athlete. This is a preview flow.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAssignModal}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                {products.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#4a4a4a]">
                    No products yet. Create one to assign.
                  </div>
                ) : (
                  products.map((product) => {
                    const title = product.title || product.name || 'Untitled product'
                    const type = product.category || product.type || 'Product'
                    const price = product.price_cents
                      ? formatCurrency(product.price_cents / 100)
                      : formatCurrency(product.price)
                    const selected = assignProductId === product.id
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => setAssignProductId(product.id)}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          selected ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-[#191919]">{title}</p>
                          <p className="text-xs text-[#4a4a4a]">{type} • {price}</p>
                        </div>
                        {selected ? <span className="text-[#b80f0a] text-lg">✓</span> : null}
                      </button>
                    )
                  })
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#4a4a4a]">
                  Add a quick note for the athlete so they understand the assignment.
                </div>
                <textarea
                  rows={6}
                  value={assignNote}
                  onChange={(event) => setAssignNote(event.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  placeholder="Optional note for the athlete..."
                />
                {assignNotice ? <p className="text-xs text-[#b80f0a]">{assignNotice}</p> : null}
                <div className="flex flex-wrap gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      if (!assignProductId) {
                        setAssignNotice('Select a product to assign.')
                        return
                      }
                      setToast(`Program assigned to ${assignAthleteName || 'athlete'}.`)
                      closeAssignModal()
                    }}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90"
                  >
                    Assign program
                  </button>
                  <Link
                    href="/coach/marketplace/create"
                    className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919]"
                  >
                    Create new
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {upgradeModalOpen && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setUpgradeModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Marketplace</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">Upgrade to sell your own products</h2>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Your current access is through an organization. Upgrade to an individual coach plan to create listings and earn directly from athletes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(false)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/select-plan?role=coach"
                className="rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white"
              >
                Upgrade plan
              </Link>
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(false)}
                className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
