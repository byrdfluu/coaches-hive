'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
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
  coach_id?: string | null
  org_id?: string | null
  type?: string | null
  media_url?: string | null
  inventory_count?: number | null
  shipping_required?: boolean | null
  shipping_notes?: string | null
  team_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type OrderRow = {
  id: string
  product_id?: string | null
  coach_id?: string | null
  org_id?: string | null
  athlete_id?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  status?: string | null
  fulfillment_status?: string | null
  refund_status?: string | null
  created_at?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
}

type TeamRow = {
  id: string
  name?: string | null
  coach_id?: string | null
}

type TeamMemberRow = {
  team_id?: string | null
  athlete_id?: string | null
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '$0'
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isNaN(parsed)) return value
    return `$${parsed.toFixed(2).replace(/\\.00$/, '')}`
  }
  return `$${value.toFixed(2).replace(/\\.00$/, '')}`
}

const UNASSIGNED_TEAM_ID = 'unassigned'

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-').map((part) => Number(part))
  const date = new Date(year, month - 1, 1)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

const formatOrderDate = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const getProductPrice = (product: ProductRow) => {
  const raw = product.price_cents ? product.price_cents / 100 : product.price
  const value = Number(raw ?? 0)
  return Number.isFinite(value) ? value : 0
}

const getProductStatus = (product: ProductRow) => String(product.status || 'published').toLowerCase()

const getProductUpdatedAt = (product: ProductRow) => {
  const value = product.updated_at || product.created_at || ''
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return date
}

export default function OrgMarketplacePage() {
  const router = useRouter()
  const [orgProducts, setOrgProducts] = useState<ProductRow[]>([])
  const [coachProducts, setCoachProducts] = useState<ProductRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [coaches, setCoaches] = useState<Record<string, ProfileRow>>({})
  const [athletes, setAthletes] = useState<Record<string, ProfileRow>>({})
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgStripeConnected, setOrgStripeConnected] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'archived'>('all')
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'org' | 'coach'>('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [priceFilter, setPriceFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'newest' | 'best_selling' | 'highest_revenue' | 'lowest_price'>('newest')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [previewProductId, setPreviewProductId] = useState<string | null>(null)
  const [showAssignTeamModal, setShowAssignTeamModal] = useState(false)
  const [assignTeamId, setAssignTeamId] = useState('all')
  const [toastMessage, setToastMessage] = useState('')
  const [orgTier, setOrgTier] = useState<'standard' | 'growth' | 'enterprise'>('standard')
  const [planStatus, setPlanStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled'>('trialing')
  const [showRevenueModal, setShowRevenueModal] = useState(false)
  const [selectedRevenueMonth, setSelectedRevenueMonth] = useState<string | null>(null)
  const [showOrdersModal, setShowOrdersModal] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadMarketplace = async () => {
      setLoading(true)
      setNotice('')
      const [marketplaceResponse, settingsResponse] = await Promise.all([
        fetch('/api/org/marketplace'),
        fetch('/api/org/settings'),
      ])
      if (!marketplaceResponse.ok) {
        const payload = await marketplaceResponse.json().catch(() => ({}))
        setNotice(payload?.error || 'Unable to load marketplace.')
        setLoading(false)
        return
      }
      const payload = await marketplaceResponse.json()

      if (!active) return
      const coachMap: Record<string, ProfileRow> = {}
      ;(payload.coaches || []).forEach((coach: ProfileRow) => {
        coachMap[coach.id] = coach
      })
      const athleteMap: Record<string, ProfileRow> = {}
      ;(payload.athletes || []).forEach((athlete: ProfileRow) => {
        athleteMap[athlete.id] = athlete
      })
      setCoaches(coachMap)
      setAthletes(athleteMap)
      setOrgProducts((payload.orgProducts || []) as ProductRow[])
      setCoachProducts((payload.coachProducts || []) as ProductRow[])
      setOrders((payload.orders || []) as OrderRow[])
      setTeams((payload.teams || []) as TeamRow[])
      setTeamMembers((payload.teamMembers || []) as TeamMemberRow[])
      setOrgName(payload.orgName || '')
      setOrgStripeConnected(Boolean(payload.orgStripeConnected))
      if (settingsResponse.ok) {
        const settingsPayload = await settingsResponse.json()
        setOrgTier(normalizeOrgTier(settingsPayload.settings?.plan))
        setPlanStatus(normalizeOrgStatus(settingsPayload.settings?.plan_status))
      }
      setLoading(false)
    }

    loadMarketplace()
    return () => {
      active = false
    }
  }, [])

  const revenue = useMemo(() => {
    return orders.reduce((sum, order) => {
      const value = Number(order.amount ?? order.total ?? order.price ?? 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  }, [orders])

  const allProducts = useMemo(() => {
    return [...orgProducts, ...coachProducts]
  }, [orgProducts, coachProducts])

  const productStats = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number }>()
    orders.forEach((order) => {
      if (!order.product_id) return
      const existing = map.get(order.product_id) || { orders: 0, revenue: 0 }
      const value = Number(order.amount ?? order.total ?? order.price ?? 0)
      if (Number.isFinite(value)) {
        existing.revenue += value
      }
      existing.orders += 1
      map.set(order.product_id, existing)
    })
    return map
  }, [orders])

  const monthlyRevenue = useMemo(() => {
    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()
    return orders.reduce((sum, order) => {
      if (!order.created_at) return sum
      const date = new Date(order.created_at)
      if (Number.isNaN(date.getTime())) return sum
      if (date.getMonth() !== month || date.getFullYear() !== year) return sum
      const value = Number(order.amount ?? order.total ?? order.price ?? 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  }, [orders])

  const statusCounts = useMemo(() => {
    const counts = { published: 0, draft: 0, archived: 0 }
    allProducts.forEach((product) => {
      const status = getProductStatus(product)
      if (status === 'draft') counts.draft += 1
      else if (status === 'archived') counts.archived += 1
      else counts.published += 1
    })
    return counts
  }, [allProducts])

  const productTypes = useMemo(() => {
    return Array.from(
      new Set(allProducts.map((product) => (product.type || 'Offer').toLowerCase()))
    )
  }, [allProducts])

  const teamOptions = useMemo(() => {
    const options = teams
      .map((team) => ({ id: team.id, name: team.name || 'Team' }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return [{ id: 'all', name: 'All teams' }, ...options]
  }, [teams])

  const productNameById = useMemo(() => {
    return allProducts.reduce<Record<string, string>>((acc, product) => {
      acc[product.id] = product.title || product.name || 'Product'
      return acc
    }, {})
  }, [allProducts])

  const productById = useMemo(() => {
    return allProducts.reduce<Record<string, ProductRow>>((acc, product) => {
      acc[product.id] = product
      return acc
    }, {})
  }, [allProducts])

  const teamIdsByAthlete = useMemo(() => {
    const map = new Map<string, string[]>()
    teamMembers.forEach((member) => {
      if (!member.athlete_id || !member.team_id) return
      const existing = map.get(member.athlete_id) || []
      existing.push(member.team_id)
      map.set(member.athlete_id, existing)
    })
    return map
  }, [teamMembers])

  const teamIdsByCoach = useMemo(() => {
    const map = new Map<string, string[]>()
    teams.forEach((team) => {
      if (!team.coach_id) return
      const existing = map.get(team.coach_id) || []
      existing.push(team.id)
      map.set(team.coach_id, existing)
    })
    return map
  }, [teams])

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matchesPrice = (value: number) => {
      if (priceFilter === 'under_25') return value < 25
      if (priceFilter === '25_50') return value >= 25 && value <= 50
      if (priceFilter === '50_100') return value > 50 && value <= 100
      if (priceFilter === '100_plus') return value > 100
      return true
    }
    const base = allProducts.filter((product) => {
      const name = (product.title || product.name || '').toLowerCase()
      const matchesSearch = !query || name.includes(query)
      const matchesStatus = statusFilter === 'all' || getProductStatus(product) === statusFilter
      const matchesOwner =
        ownerFilter === 'all' ||
        (ownerFilter === 'org' ? Boolean(product.org_id) : Boolean(product.coach_id))
      const matchesType =
        typeFilter === 'all' || (product.type || 'offer').toLowerCase() === typeFilter
      const priceValue = getProductPrice(product)
      const matchesPriceRange = matchesPrice(priceValue)
      let matchesTeam = true
      if (teamFilter !== 'all') {
        if (product.org_id) {
          matchesTeam = true
        } else {
          if (product.team_id) {
            matchesTeam = product.team_id === teamFilter
          } else {
            const fallbackTeams = product.coach_id ? teamIdsByCoach.get(product.coach_id) || [] : []
            matchesTeam = product.org_id ? true : fallbackTeams.includes(teamFilter)
          }
        }
      }
      return matchesSearch && matchesStatus && matchesOwner && matchesType && matchesPriceRange && matchesTeam
    })
    const sorted = [...base]
    sorted.sort((a, b) => {
      if (sortBy === 'lowest_price') {
        return getProductPrice(a) - getProductPrice(b)
      }
      if (sortBy === 'highest_revenue') {
        const left = productStats.get(a.id)?.revenue || 0
        const right = productStats.get(b.id)?.revenue || 0
        return right - left
      }
      if (sortBy === 'best_selling') {
        const left = productStats.get(a.id)?.orders || 0
        const right = productStats.get(b.id)?.orders || 0
        return right - left
      }
      const leftDate = getProductUpdatedAt(a)
      const rightDate = getProductUpdatedAt(b)
      return (rightDate?.getTime() || 0) - (leftDate?.getTime() || 0)
    })
    return sorted
  }, [
    allProducts,
    ownerFilter,
    priceFilter,
    productStats,
    search,
    sortBy,
    statusFilter,
    teamFilter,
    teamIdsByCoach,
    typeFilter,
  ])

  const { ordersByTeam, unassignedOrders } = useMemo(() => {
    const map = new Map<string, OrderRow[]>()
    const unassigned: OrderRow[] = []
    orders.forEach((order) => {
      const teamIds = new Set<string>()
      if (order.athlete_id) {
        ;(teamIdsByAthlete.get(order.athlete_id) || []).forEach((teamId) => teamIds.add(teamId))
      }
      if (order.coach_id) {
        ;(teamIdsByCoach.get(order.coach_id) || []).forEach((teamId) => teamIds.add(teamId))
      }
      if (teamIds.size === 0) {
        unassigned.push(order)
        return
      }
      teamIds.forEach((teamId) => {
        const existing = map.get(teamId) || []
        existing.push(order)
        map.set(teamId, existing)
      })
    })
    return { ordersByTeam: map, unassignedOrders: unassigned }
  }, [orders, teamIdsByAthlete, teamIdsByCoach])

  const selectedTeam = useMemo(
    () => {
      if (!selectedTeamId) return null
      if (selectedTeamId === UNASSIGNED_TEAM_ID) {
        return { id: UNASSIGNED_TEAM_ID, name: 'Unassigned', coach_id: null }
      }
      return teams.find((team) => team.id === selectedTeamId) || null
    },
    [teams, selectedTeamId]
  )

  const selectedTeamOrders = useMemo(() => {
    if (!selectedTeamId) return []
    if (selectedTeamId === UNASSIGNED_TEAM_ID) {
      return [...unassignedOrders].sort((a, b) => {
        const left = a.created_at ? new Date(a.created_at).getTime() : 0
        const right = b.created_at ? new Date(b.created_at).getTime() : 0
        return right - left
      })
    }
    const teamOrders = ordersByTeam.get(selectedTeamId) || []
    return [...teamOrders].sort((a, b) => {
      const left = a.created_at ? new Date(a.created_at).getTime() : 0
      const right = b.created_at ? new Date(b.created_at).getTime() : 0
      return right - left
    })
  }, [ordersByTeam, selectedTeamId, unassignedOrders])

  const orderSourceLabel = (order: OrderRow) => {
    if (order.athlete_id) {
      return `Athlete: ${athletes[order.athlete_id]?.full_name || 'Athlete'}`
    }
    if (order.coach_id) {
      return `Coach: ${coaches[order.coach_id]?.full_name || 'Coach'}`
    }
    return 'Org purchase'
  }

  const revenueByMonth = useMemo(() => {
    const bucket = new Map<
      string,
      {
        key: string
        date: Date
        total: number
        items: Map<string, number>
      }
    >()
    orders.forEach((order) => {
      if (!order.created_at) return
      const date = new Date(order.created_at)
      if (Number.isNaN(date.getTime())) return
      const value = Number(order.amount ?? order.total ?? order.price ?? 0)
      if (!Number.isFinite(value) || value <= 0) return
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const entry =
        bucket.get(key) || {
          key,
          date: new Date(date.getFullYear(), date.getMonth(), 1),
          total: 0,
          items: new Map<string, number>(),
        }
      entry.total += value
      const productId = order.product_id || 'unknown'
      entry.items.set(productId, (entry.items.get(productId) || 0) + value)
      bucket.set(key, entry)
    })
    return Array.from(bucket.values())
      .map((entry) => ({
        key: entry.key,
        date: entry.date,
        label: formatMonthLabel(entry.key),
        total: entry.total,
        items: Array.from(entry.items.entries())
          .map(([productId, total]) => ({
            productId,
            name: productNameById[productId] || 'Unknown product',
            total,
          }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [orders, productNameById])

  const selectedMonth = useMemo(
    () => revenueByMonth.find((item) => item.key === selectedRevenueMonth) || null,
    [revenueByMonth, selectedRevenueMonth]
  )

  const planActive = isOrgPlanActive(planStatus)
  const marketplaceEnabled = planActive && ORG_FEATURES[orgTier].marketplacePublishing
  const marketplaceLimit = ORG_MARKETPLACE_LIMITS[orgTier]
  const orgActiveListings = useMemo(
    () => orgProducts.filter((product) => getProductStatus(product) === 'published').length,
    [orgProducts]
  )
  const publishCapReached = marketplaceLimit !== null && orgActiveListings >= marketplaceLimit
  const statusLabel = formatTierName(planStatus)
  const tierLabel = formatTierName(orgTier)

  const selectedCount = selectedProducts.length
  const previewProduct = previewProductId ? productById[previewProductId] : null

  const toggleProductSelection = (id: string) => {
    setSelectedProducts((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const selectAllFiltered = () => {
    setSelectedProducts(filteredProducts.map((product) => product.id))
  }

  const clearSelection = () => {
    setSelectedProducts([])
  }

  const updateProductStatus = async (productId: string, nextStatus: string) => {
    const response = await fetch('/api/org/marketplace/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: [productId], status: nextStatus }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setToastMessage(payload?.error || 'Unable to update product.')
      return
    }
    setOrgProducts((prev) =>
      prev.map((product) => (product.id === productId ? { ...product, status: nextStatus } : product))
    )
    setCoachProducts((prev) =>
      prev.map((product) => (product.id === productId ? { ...product, status: nextStatus } : product))
    )
    setToastMessage('Product updated.')
  }

  const applyBulkStatus = async (nextStatus: string) => {
    if (selectedCount === 0) return
    const response = await fetch('/api/org/marketplace/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: selectedProducts, status: nextStatus }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setToastMessage(payload?.error || 'Unable to update products.')
      return
    }
    setOrgProducts((prev) =>
      prev.map((product) => (selectedProducts.includes(product.id) ? { ...product, status: nextStatus } : product))
    )
    setCoachProducts((prev) =>
      prev.map((product) => (selectedProducts.includes(product.id) ? { ...product, status: nextStatus } : product))
    )
    setToastMessage(`Updated ${selectedCount} product${selectedCount === 1 ? '' : 's'}.`)
    setSelectedProducts([])
  }

  const applyBulkTeam = async () => {
    if (selectedCount === 0) return
    const response = await fetch('/api/org/marketplace/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: selectedProducts, team_id: assignTeamId }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setToastMessage(payload?.error || 'Unable to assign team.')
      return
    }
    setOrgProducts((prev) =>
      prev.map((product) =>
        selectedProducts.includes(product.id)
          ? { ...product, team_id: assignTeamId === 'all' ? null : assignTeamId }
          : product
      )
    )
    setCoachProducts((prev) =>
      prev.map((product) =>
        selectedProducts.includes(product.id)
          ? { ...product, team_id: assignTeamId === 'all' ? null : assignTeamId }
          : product
      )
    )
    setToastMessage(`Assigned ${selectedCount} product${selectedCount === 1 ? '' : 's'} to team.`)
    setSelectedProducts([])
    setShowAssignTeamModal(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Marketplace</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Manage org storefront products, coach offers, and marketplace orders.</p>
            {!planActive ? (
              <p className="mt-2 text-xs text-[#4a4a4a]">
                Billing status: {statusLabel}. Activate billing to publish org products.
              </p>
            ) : !ORG_FEATURES[orgTier].marketplacePublishing ? (
              <p className="mt-2 text-xs text-[#4a4a4a]">
                Org marketplace publishing is available on Growth or Enterprise. Current plan: {tierLabel}.
              </p>
            ) : publishCapReached ? (
              <p className="mt-2 text-xs text-[#4a4a4a]">
                Marketplace listing limit reached ({marketplaceLimit}). Unpublish a listing to add more.
              </p>
            ) : null}
          </div>
          <div className="ml-auto flex w-full flex-wrap items-start justify-end gap-2 lg:w-auto lg:flex-nowrap">
            <button
              className="inline-flex shrink-0 self-start items-center justify-center whitespace-nowrap rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b80f0a] disabled:bg-[#b80f0a] disabled:text-white disabled:opacity-100"
              disabled={!marketplaceEnabled}
              onClick={() => {
                if (!marketplaceEnabled) {
                  setNotice('Activate billing or upgrade to publish org products.')
                  return
                }
                router.push('/org/marketplace/create')
              }}
            >
              Create org product
            </button>
            <Link
              href="/athlete/marketplace"
              className="inline-flex shrink-0 self-start items-center justify-center whitespace-nowrap rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f7f6f4]"
            >
              View athlete marketplace
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-6">
            {notice ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">
                {notice}
              </div>
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-4">
                  <div className="glass-card border border-[#191919] bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Total products</p>
                    <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : allProducts.length}</p>
                  </div>
                  <div className="glass-card border border-[#191919] bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Active listings</p>
                    <p className="mt-2 text-2xl font-semibold text-[#191919]">
                      {loading ? '...' : statusCounts.published}
                    </p>
                  </div>
                  <div className="glass-card border border-[#191919] bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Draft listings</p>
                    <p className="mt-2 text-2xl font-semibold text-[#191919]">
                      {loading ? '...' : statusCounts.draft}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRevenueModal(true)}
                    className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Monthly revenue</p>
                    <p className="mt-2 text-2xl font-semibold text-[#191919]">
                      {loading ? '...' : formatCurrency(monthlyRevenue)}
                    </p>
                    <p className="mt-2 text-xs text-[#4a4a4a]">View monthly breakdown</p>
                  </button>
                </section>

                <section className="glass-card border border-[#191919] bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-[#191919]">Products</h2>
                      <p className="text-sm text-[#4a4a4a]">
                        {orgName ? `${orgName} marketplace inventory` : 'Marketplace inventory'} ·
                        {' '}Org products: {orgProducts.length} · Coach products: {coachProducts.length}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setShowOrdersModal(true)}
                        className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        View orders
                      </button>
                      {marketplaceLimit !== null ? (
                        <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">
                          Listing limit: {marketplaceLimit}
                        </span>
                      ) : null}
                      {orgStripeConnected ? (
                        <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">
                          Stripe connected
                        </span>
                      ) : (
                        <span className="rounded-full border border-[#b80f0a] px-3 py-1 text-xs text-[#b80f0a]">
                          Connect Stripe in Settings
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    {[
                      { id: 'all', label: `All (${allProducts.length})` },
                      { id: 'published', label: `Active (${statusCounts.published})` },
                      { id: 'draft', label: `Drafts (${statusCounts.draft})` },
                      { id: 'archived', label: `Archived (${statusCounts.archived})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                        className={`rounded-full border px-3 py-1 font-semibold transition ${
                          statusFilter === tab.id
                            ? 'border-[#191919] bg-[#191919] text-white'
                            : 'border-[#dcdcdc] text-[#4a4a4a] hover:text-[#191919]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 text-sm lg:grid-cols-6">
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search products"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] lg:col-span-2"
                    />
                    <select
                      value={ownerFilter}
                      onChange={(event) => setOwnerFilter(event.target.value as typeof ownerFilter)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]"
                    >
                      <option value="all">All owners</option>
                      <option value="org">Org products</option>
                      <option value="coach">Coach products</option>
                    </select>
                    <select
                      value={typeFilter}
                      onChange={(event) => setTypeFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]"
                    >
                      <option value="all">All types</option>
                      {productTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <select
                      value={teamFilter}
                      onChange={(event) => setTeamFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]"
                    >
                      {teamOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={priceFilter}
                      onChange={(event) => setPriceFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]"
                    >
                      <option value="all">All prices</option>
                      <option value="under_25">Under $25</option>
                      <option value="25_50">$25 - $50</option>
                      <option value="50_100">$50 - $100</option>
                      <option value="100_plus">$100+</option>
                    </select>
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] lg:col-span-2"
                    >
                      <option value="newest">Sort: Newest</option>
                      <option value="best_selling">Sort: Best selling</option>
                      <option value="highest_revenue">Sort: Highest revenue</option>
                      <option value="lowest_price">Sort: Lowest price</option>
                    </select>
                  </div>

                  {selectedCount > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs">
                      <span className="font-semibold text-[#191919]">{selectedCount} selected</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => applyBulkStatus('published')}
                          disabled={!marketplaceEnabled || publishCapReached}
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
                        >
                          Publish
                        </button>
                        <button
                          type="button"
                          onClick={() => applyBulkStatus('draft')}
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                        >
                          Unpublish
                        </button>
                        <button
                          type="button"
                          onClick={() => applyBulkStatus('archived')}
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAssignTeamModal(true)}
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                        >
                          Assign team
                        </button>
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#4a4a4a]"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#4a4a4a]">
                      <p>{filteredProducts.length} products shown</p>
                      <button
                        type="button"
                        onClick={selectAllFiltered}
                        className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#4a4a4a] hover:text-[#191919]"
                      >
                        Select all visible
                      </button>
                    </div>
                  )}

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {loading ? (
                      <LoadingState label="Loading products..." />
                    ) : filteredProducts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-white p-8 text-center text-sm text-[#4a4a4a]">
                        <p className="text-base font-semibold text-[#191919]">No products match your filters.</p>
                        <p className="mt-2">Try adjusting your filters or create a new product.</p>
                        <div className="mt-4 flex justify-center">
                          <button
                            type="button"
                            onClick={() => router.push('/org/marketplace/create')}
                            className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                          >
                            Create product
                          </button>
                        </div>
                      </div>
                    ) : (
                      filteredProducts.map((product) => {
                        const ownerLabel = product.org_id
                          ? 'Org product'
                          : `Coach: ${product.coach_id ? coaches[product.coach_id]?.full_name || 'Coach' : 'Coach'}`
                        const status = getProductStatus(product)
                        const stats = productStats.get(product.id) || { orders: 0, revenue: 0 }
                        const updatedAt = getProductUpdatedAt(product)
                        const assignedTeam =
                          product.team_id || (product.coach_id ? teamIdsByCoach.get(product.coach_id)?.[0] : '')
                        const assignedTeamLabel = assignedTeam
                          ? teams.find((team) => team.id === assignedTeam)?.name || 'Assigned team'
                          : 'All teams'
                        const inventoryLabel =
                          product.inventory_count === null || product.inventory_count === undefined
                            ? 'Unlimited'
                            : product.inventory_count === 0
                              ? 'Out of stock'
                              : `${product.inventory_count} left`
                        return (
                          <div key={product.id} className="rounded-2xl border border-[#dcdcdc] bg-white p-4 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <label className="mt-1">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-[#dcdcdc]"
                                    checked={selectedProducts.includes(product.id)}
                                    onChange={() => toggleProductSelection(product.id)}
                                  />
                                </label>
                                <div>
                                  <p className="font-semibold text-[#191919]">{product.title || product.name || 'Product'}</p>
                                  <p className="text-xs text-[#4a4a4a]">{ownerLabel}</p>
                                </div>
                              </div>
                              <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">
                                {status}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#4a4a4a]">
                              <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                                {formatCurrency(getProductPrice(product))}
                              </span>
                              <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                                {product.type || 'Offer'}
                              </span>
                              <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                                Team: {assignedTeamLabel}
                              </span>
                              <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                                Availability: {inventoryLabel}
                              </span>
                              {product.shipping_required ? (
                                <span className="rounded-full border border-[#dcdcdc] px-3 py-1">Shipping required</span>
                              ) : null}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#4a4a4a]">
                              <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                                Sales: {stats.orders}
                              </span>
                              <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                                Revenue: {formatCurrency(stats.revenue)}
                              </span>
                              <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                                Updated: {updatedAt ? updatedAt.toLocaleDateString() : '—'}
                              </span>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => setPreviewProductId(product.id)}
                                className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                              >
                                Preview
                              </button>
                              {product.org_id ? (
                                <Link
                                  href={`/org/marketplace/product/${product.id}/edit`}
                                  className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                                >
                                  Edit
                                </Link>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => updateProductStatus(product.id, status === 'published' ? 'draft' : 'published')}
                                disabled={status !== 'published' && (!marketplaceEnabled || publishCapReached)}
                                className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#4a4a4a] disabled:opacity-50"
                              >
                                {status === 'published' ? 'Unpublish' : 'Publish'}
                              </button>
                              <button
                                type="button"
                                onClick={() => updateProductStatus(product.id, 'archived')}
                                className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#4a4a4a]"
                              >
                                Archive
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </section>

                <section className="glass-card border border-[#191919] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#191919]">Recent orders</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    {loading ? (
                      <LoadingState label="Loading orders..." />
                    ) : orders.length === 0 ? (
                      <EmptyState title="No marketplace orders yet." description="Orders will appear here once buyers check out." />
                    ) : (
                      orders.slice(0, 6).map((order) => (
                        <div key={order.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-[#191919]">
                                {formatCurrency(order.amount ?? order.total ?? order.price)}
                              </p>
                              <p className="text-xs text-[#4a4a4a]">
                                {order.coach_id
                                  ? `Coach: ${coaches[order.coach_id]?.full_name || 'Coach'}`
                                  : 'Org product'} · Status: {order.status || 'Active'}
                              </p>
                            </div>
                            <Link href={`/org/marketplace/orders/${order.id}`} className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                              View
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
      {previewProduct && (
        <div className="fixed inset-0 z-[1050] flex justify-end bg-black/30">
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Product preview</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {previewProduct.title || previewProduct.name || 'Product'}
                </h2>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  {previewProduct.org_id
                    ? 'Org product'
                    : `Coach: ${previewProduct.coach_id ? coaches[previewProduct.coach_id]?.full_name || 'Coach' : 'Coach'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProductId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em]">Status</p>
                <p className="mt-1 font-semibold text-[#191919]">{getProductStatus(previewProduct)}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em]">Price</p>
                <p className="mt-1 font-semibold text-[#191919]">
                  {formatCurrency(getProductPrice(previewProduct))}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em]">Type</p>
                <p className="mt-1 font-semibold text-[#191919]">{previewProduct.type || 'Offer'}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em]">Team</p>
                <p className="mt-1 font-semibold text-[#191919]">
                  {previewProduct.team_id
                    ? teams.find((team) => team.id === previewProduct.team_id)?.name || 'Assigned team'
                    : 'All teams'}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em]">Performance</p>
                <p className="mt-1 font-semibold text-[#191919]">
                  Orders: {productStats.get(previewProduct.id)?.orders || 0}
                </p>
                <p className="text-xs text-[#4a4a4a]">
                  Revenue: {formatCurrency(productStats.get(previewProduct.id)?.revenue || 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em]">Availability</p>
                <p className="mt-1 font-semibold text-[#191919]">
                  {previewProduct.inventory_count === null || previewProduct.inventory_count === undefined
                    ? 'Unlimited'
                    : previewProduct.inventory_count === 0
                      ? 'Out of stock'
                      : `${previewProduct.inventory_count} left`}
                </p>
                {previewProduct.shipping_required ? (
                  <p className="text-xs text-[#4a4a4a]">Shipping required</p>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {previewProduct.org_id ? (
                <Link
                  href={`/org/marketplace/product/${previewProduct.id}/edit`}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Edit product
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  updateProductStatus(previewProduct.id, getProductStatus(previewProduct) === 'published' ? 'draft' : 'published')
                }
                disabled={getProductStatus(previewProduct) !== 'published' && (!marketplaceEnabled || publishCapReached)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-50"
              >
                {getProductStatus(previewProduct) === 'published' ? 'Unpublish' : 'Publish'}
              </button>
              <button
                type="button"
                onClick={() => updateProductStatus(previewProduct.id, 'archived')}
                className="rounded-full border border-[#dcdcdc] px-4 py-2 text-xs font-semibold text-[#4a4a4a]"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
      {showAssignTeamModal && (
        <div className="fixed inset-0 z-[1070] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Assign team</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">Apply to selected products</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">{selectedCount} selected</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignTeamModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <select
                value={assignTeamId}
                onChange={(event) => setAssignTeamId(event.target.value)}
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
              >
                {teamOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAssignTeamModal(false)}
                  className="rounded-full border border-[#dcdcdc] px-4 py-2 text-xs font-semibold text-[#4a4a4a]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyBulkTeam}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                >
                  Assign team
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showRevenueModal && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Gross revenue</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Monthly breakdown</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">{formatCurrency(revenue)} total</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRevenueModal(false)
                  setSelectedRevenueMonth(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {revenueByMonth.length === 0 ? (
                <EmptyState title="No revenue yet." description="Revenue appears once orders are paid." />
              ) : (
                revenueByMonth.map((month) => (
                  <button
                    key={month.key}
                    type="button"
                    onClick={() => setSelectedRevenueMonth(month.key)}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left text-sm transition hover:border-[#b80f0a]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#191919]">{month.label}</p>
                      <p className="text-xs text-[#4a4a4a]">{month.items.length} products</p>
                    </div>
                    <p className="text-sm font-semibold text-[#191919]">{formatCurrency(month.total)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {selectedMonth && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Revenue detail</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{selectedMonth.label}</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">{formatCurrency(selectedMonth.total)} total</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRevenueMonth(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {selectedMonth.items.length === 0 ? (
                <p className="text-sm text-[#4a4a4a]">No product revenue recorded for this month.</p>
              ) : (
                selectedMonth.items.map((item) => (
                  <div key={item.productId} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#191919]">{item.name}</p>
                      <p className="text-sm font-semibold text-[#191919]">{formatCurrency(item.total)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                onClick={() => setSelectedRevenueMonth(null)}
              >
                Back to months
              </button>
            </div>
          </div>
        </div>
      )}
      {showOrdersModal && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Orders</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">By team</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">Select a team to see who placed orders.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowOrdersModal(false)
                  setSelectedTeamId(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {teams.length === 0 ? (
                <EmptyState title="No teams yet." description="Create teams to see orders organized by roster." />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedTeamId(UNASSIGNED_TEAM_ID)}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left text-sm transition hover:border-[#b80f0a]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#191919]">Unassigned</p>
                      <p className="text-xs text-[#4a4a4a]">
                        Missing team mapping · Orders: {unassignedOrders.length}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#b80f0a]">View</span>
                  </button>
                  {[...teams]
                    .sort((a, b) => (a.name || 'Team').localeCompare(b.name || 'Team'))
                    .map((team) => {
                      const orderCount = ordersByTeam.get(team.id)?.length || 0
                      return (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => setSelectedTeamId(team.id)}
                          className="flex w-full items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left text-sm transition hover:border-[#b80f0a]"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[#191919]">{team.name || 'Team'}</p>
                            <p className="text-xs text-[#4a4a4a]">
                              Coach: {team.coach_id ? coaches[team.coach_id]?.full_name || 'Coach' : 'Unassigned'} ·
                              {' '}Orders: {orderCount}
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-[#b80f0a]">View</span>
                        </button>
                      )
                    })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {showOrdersModal && selectedTeam && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Team orders</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{selectedTeam.name || 'Team'}</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">
                  {selectedTeamId === UNASSIGNED_TEAM_ID
                    ? 'Orders without a team assignment.'
                    : `${selectedTeamOrders.length} orders`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeamId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {selectedTeamOrders.length === 0 ? (
                <EmptyState title="No orders yet." description="Orders will appear once purchases are made." />
              ) : (
                selectedTeamOrders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#191919]">
                          {order.product_id ? productNameById[order.product_id] || 'Product' : 'Product'}
                        </p>
                        <p className="text-xs text-[#4a4a4a]">
                          {orderSourceLabel(order)} · {formatOrderDate(order.created_at)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-[#191919]">
                        {formatCurrency(order.amount ?? order.total ?? order.price)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                onClick={() => setSelectedTeamId(null)}
              >
                Back to teams
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    </main>
  )
}
