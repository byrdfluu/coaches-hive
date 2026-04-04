'use client'

import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { useEffect, useMemo, useState } from 'react'
import { FeeTier, getFeePercentage, resolveProductCategory } from '@/lib/platformFees'

type OrderRow = {
  id: string
  product_id?: string | null
  athlete_id?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  created_at?: string | null
}

type ProductRow = {
  id: string
  title?: string | null
  name?: string | null
  type?: string | null
  category?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
}

type FeeRuleRow = {
  tier: string
  category: string
  percentage: number
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

export default function RevenueBreakdownPage() {
  const supabase = createClientComponentClient()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [products, setProducts] = useState<Record<string, ProductRow>>({})
  const [buyers, setBuyers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [coachTier, setCoachTier] = useState<FeeTier>('starter')
  const [feeRules, setFeeRules] = useState<FeeRuleRow[]>([])

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
      const { data: orderRows } = await supabase
        .from('orders')
        .select('*')
        .eq('coach_id', currentUserId)
        .order('created_at', { ascending: false })

      if (!mounted) return
      const rows = (orderRows || []) as OrderRow[]
      setOrders(rows)

      const productIds = Array.from(new Set(rows.map((row) => row.product_id).filter(Boolean) as string[]))
      const buyerIds = Array.from(new Set(rows.map((row) => row.athlete_id).filter(Boolean) as string[]))

      if (productIds.length > 0) {
        const { data: productRows } = await supabase
          .from('products')
          .select('id, title, name, type, category')
          .in('id', productIds)
        const products = (productRows || []) as ProductRow[]
        const productMap: Record<string, ProductRow> = {}
        products.forEach((product) => {
          productMap[product.id] = product
        })
        if (mounted) {
          setProducts(productMap)
        }
      } else {
        setProducts({})
      }

      if (buyerIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', buyerIds)
        const buyerProfiles = (profileRows || []) as ProfileRow[]
        const buyerMap: Record<string, string> = {}
        buyerProfiles.forEach((profile) => {
          if (profile.full_name) {
            buyerMap[profile.id] = profile.full_name
          }
        })
        if (mounted) {
          setBuyers(buyerMap)
        }
      } else {
        setBuyers({})
      }

      const { data: planRow } = await supabase
        .from('coach_plans')
        .select('tier')
        .eq('coach_id', currentUserId)
        .maybeSingle()

      const { data: feeRuleRows } = await supabase
        .from('platform_fee_rules')
        .select('tier, category, percentage')
        .eq('active', true)

      if (planRow?.tier) {
        setCoachTier(planRow.tier as FeeTier)
      }
      setFeeRules((feeRuleRows || []) as FeeRuleRow[])

      setLoading(false)
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [currentUserId, supabase])


  const revenueLines = useMemo(() => {
    return orders.map((order) => {
      const product = order.product_id ? products[order.product_id] : undefined
      const productName = product?.title || product?.name || 'Product'
      const buyer = order.athlete_id ? buyers[order.athlete_id] : 'Athlete'
      const amount = parseAmount(order.amount ?? order.total ?? order.price)
      const category = resolveProductCategory(product?.type || product?.category)
      const percent = getFeePercentage(coachTier, category, feeRules)
      const feeAmount = amount * (percent / 100)
      return {
        id: order.id,
        product: productName,
        buyer,
        amount,
        feeAmount,
        net: amount - feeAmount,
      }
    })
  }, [orders, products, buyers, coachTier, feeRules])

  const totals = useMemo(() => {
    return revenueLines.reduce(
      (acc, line) => {
        acc.gross += line.amount
        acc.fees += line.feeAmount
        acc.net += line.net
        return acc
      },
      { gross: 0, fees: 0, net: 0 }
    )
  }, [revenueLines])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Revenue</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Revenue this month</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Breakdown by product and buyer.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/coach/settings#export-center"
              className="self-start rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
            <Link href="/coach/marketplace" className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919]">
              Back to marketplace
            </Link>
          </div>
        </header>

        <section className="mt-8 glass-card border border-[#191919] bg-white p-6">
          <div className="grid grid-cols-4 text-sm font-semibold text-[#191919]">
            <span>Product</span>
            <span>Buyer</span>
            <span className="text-right">Platform fee</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
            {loading ? (
              <LoadingState label="Loading revenue..." />
            ) : revenueLines.length === 0 ? (
              <EmptyState title="No orders yet." description="Sales will appear here once buyers checkout." />
            ) : (
              revenueLines.map((line) => (
                <div key={line.id} className="grid grid-cols-4 items-center rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <span className="font-semibold text-[#191919]">{line.product}</span>
                  <span>{line.buyer}</span>
                  <span className="text-right text-[#191919]">{formatCurrency(line.feeAmount)}</span>
                  <span className="text-right text-[#191919]">{formatCurrency(line.amount)}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-6 grid gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#4a4a4a] md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em]">Gross</p>
              <p className="mt-1 text-lg font-semibold text-[#191919]">{formatCurrency(totals.gross)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em]">Platform fees</p>
              <p className="mt-1 text-lg font-semibold text-[#191919]">{formatCurrency(totals.fees)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em]">Net</p>
              <p className="mt-1 text-lg font-semibold text-[#191919]">{formatCurrency(totals.net)}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
