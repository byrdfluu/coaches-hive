'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import { useAthleteAccess } from '@/components/AthleteAccessProvider'
import {
  guardianPendingMessage,
  isGuardianApprovalApiError,
  requestGuardianApproval,
} from '@/lib/guardianApprovalClient'

type FeeRow = {
  id: string
  title: string
  amount_cents: number
  due_date?: string | null
  org_id: string
}

type AssignmentRow = {
  id: string
  fee_id: string
  status: string
  paid_at?: string | null
  created_at?: string | null
}

type SessionPaymentRow = {
  id: string
  session_id: string
  coach_id: string
  coach_name?: string | null
  athlete_name?: string | null
  amount?: number | string | null
  status?: string | null
  paid_at?: string | null
  created_at?: string | null
  receipt_id?: string | null
  receipt_url?: string | null
}

type PaymentMethodRow = {
  id: string
  brand: string
  last4: string
  exp_month?: number
  exp_year?: number
}

type BillingInfoRow = {
  status?: string | null
  tier?: string | null
  current_period_end?: string | null
  trial_end?: string | null
  cancel_at_period_end?: boolean
}

type MarketplaceReceiptRow = {
  id: string
  order_id: string
  title: string
  seller: string
  amount: number
  currency: string
  status: string
  refund_status?: string | null
  receipt_url?: string | null
  created_at?: string | null
}

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\\.00$/, '')}`

const getStatusCopy = (status: string) => {
  const normalized = status.toLowerCase()
  if (normalized === 'paid') return { label: 'Paid', note: 'Receipt sent' }
  if (normalized === 'waived') return { label: 'Waived', note: 'No payment required' }
  if (normalized === 'failed') return { label: 'Failed', note: 'Auto-retry in 24h' }
  if (normalized === 'past_due') return { label: 'Past due', note: 'Retry scheduled' }
  return { label: 'Unpaid', note: 'Auto-retry in 24h' }
}

const getStatusBadge = (status: string) => {
  const normalized = status.toLowerCase()
  if (normalized === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (normalized === 'waived') return 'border-slate-200 bg-slate-50 text-slate-600'
  if (normalized === 'failed' || normalized === 'past_due') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (normalized === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-[#dcdcdc] bg-white text-[#4a4a4a]'
}

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

export default function AthletePaymentsPage() {
  const supabase = createClientComponentClient()
  const { canTransact, needsGuardianApproval } = useAthleteAccess()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [fees, setFees] = useState<FeeRow[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [sessionPayments, setSessionPayments] = useState<SessionPaymentRow[]>([])
  const [marketplaceReceipts, setMarketplaceReceipts] = useState<MarketplaceReceiptRow[]>([])
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<PaymentMethodRow[]>([])
  const [billingInfo, setBillingInfo] = useState<BillingInfoRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [payingAssignment, setPayingAssignment] = useState<AssignmentRow | null>(null)
  const [paymentNotice, setPaymentNotice] = useState('')
  const [selectedFeeDetail, setSelectedFeeDetail] = useState<{ assignment: AssignmentRow; fee: FeeRow } | null>(null)
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null)
  const [refundReason, setRefundReason] = useState('duplicate_charge')
  const [refundNote, setRefundNote] = useState('')
  const [refundSubmitting, setRefundSubmitting] = useState(false)
  const [receiptDownloading, setReceiptDownloading] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!active) return
      setCurrentUserId(data.user?.id ?? null)
    }
    loadUser()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (!currentUserId) return
    let active = true
    const loadSummary = async () => {
      const response = await fetch('/api/athlete/payments-summary', { cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json().catch(() => ({}))
      if (!active) return
      setSessionPayments((payload.session_payments || []) as SessionPaymentRow[])
      setMarketplaceReceipts((payload.marketplace_receipts || []) as MarketplaceReceiptRow[])
      setSavedPaymentMethods((payload.payment_methods || []) as PaymentMethodRow[])
      setBillingInfo((payload.billing || null) as BillingInfoRow | null)
    }
    loadSummary()
    return () => {
      active = false
    }
  }, [currentUserId])

  useEffect(() => {
    let active = true
    const loadFees = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch('/api/athlete/charges')
      if (!response.ok) {
        setNotice('Unable to load dues.')
        setLoading(false)
        return
      }
      const payload = await response.json()
      if (!active) return
      setAssignments((payload.assignments || []) as AssignmentRow[])
      setFees((payload.fees || []) as FeeRow[])
      setLoading(false)
    }
    loadFees()
    return () => {
      active = false
    }
  }, [])

  const displaySessionPayments = sessionPayments
  const displayFees = fees
  const displayAssignments = assignments

  const feeMap = useMemo(() => {
    const map = new Map<string, FeeRow>()
    displayFees.forEach((fee) => map.set(fee.id, fee))
    return map
  }, [displayFees])

  const assignmentsWithFees = useMemo(() => {
    return displayAssignments
      .map((assignment) => {
        const fee = feeMap.get(assignment.fee_id)
        if (!fee) return null
        return { assignment, fee }
      })
      .filter(Boolean) as { assignment: AssignmentRow; fee: FeeRow }[]
  }, [displayAssignments, feeMap])

  const upcomingAssignments = useMemo(() => {
    return assignmentsWithFees.filter(({ assignment }) => {
      const status = String(assignment.status || '').toLowerCase()
      return status !== 'paid' && status !== 'waived'
    })
  }, [assignmentsWithFees])

  const pastFeePayments = useMemo(() => {
    return assignmentsWithFees.filter(({ assignment }) => {
      const status = String(assignment.status || '').toLowerCase()
      return status === 'paid' || status === 'waived'
    })
  }, [assignmentsWithFees])

  const summaryStats = useMemo(() => {
    const now = new Date()
    const totalDueCents = upcomingAssignments.reduce((sum, item) => sum + item.fee.amount_cents, 0)
    const dueThisMonthCents = upcomingAssignments.reduce((sum, item) => {
      if (!item.fee.due_date) return sum
      const due = new Date(item.fee.due_date)
      if (due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear()) {
        return sum + item.fee.amount_cents
      }
      return sum
    }, 0)
    const paidFeeCents = pastFeePayments.reduce((sum, item) => sum + item.fee.amount_cents, 0)
    const paidSessionCents = displaySessionPayments.reduce((sum, payment) => {
      const status = String(payment.status || '').toLowerCase()
      if (status !== 'paid') return sum
      return sum + Math.round(Number(payment.amount || 0) * 100)
    }, 0)
    const paidMarketplaceCents = marketplaceReceipts.reduce((sum, receipt) => {
      const status = String(receipt.status || '').toLowerCase()
      if (status !== 'paid') return sum
      return sum + Math.round(Number(receipt.amount || 0) * 100)
    }, 0)
    const paidYtd = paidFeeCents + paidSessionCents + paidMarketplaceCents
    return [
      { label: 'Total due', value: formatCurrency(totalDueCents) },
      { label: 'Due this month', value: formatCurrency(dueThisMonthCents) },
      { label: 'Paid YTD', value: formatCurrency(paidYtd) },
      { label: 'Saved cards', value: String(savedPaymentMethods.length) },
    ]
  }, [displaySessionPayments, marketplaceReceipts, pastFeePayments, savedPaymentMethods.length, upcomingAssignments])

  const pastPayments = useMemo(() => {
    const feeItems = pastFeePayments.map(({ assignment, fee }) => ({
      id: assignment.id,
      type: 'Team fee',
      title: fee.title,
      amount: fee.amount_cents,
      status: assignment.status || 'paid',
      date: assignment.paid_at || assignment.created_at || fee.due_date || '',
      source: 'fee' as const,
    }))
    const sessionItems = displaySessionPayments.map((payment) => ({
      id: payment.id,
      type: 'Session',
      title: payment.coach_name || 'Coach session',
      athleteName: payment.athlete_name || null,
      amount: Math.round(Number(payment.amount || 0) * 100),
      status: payment.status || 'pending',
      date: payment.paid_at || payment.created_at || '',
      source: 'session' as const,
      receiptUrl: payment.receipt_url || null,
    }))
    const marketplaceItems = marketplaceReceipts.map((receipt) => ({
      id: receipt.id,
      type: 'Marketplace',
      title: receipt.title,
      amount: Math.round(Number(receipt.amount || 0) * 100),
      status: receipt.status || 'paid',
      date: receipt.created_at || '',
      source: 'marketplace' as const,
      receiptUrl: receipt.receipt_url || null,
      orderId: receipt.order_id,
      refundStatus: receipt.refund_status || null,
    }))
    return [...feeItems, ...sessionItems, ...marketplaceItems].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0
      const dateB = b.date ? new Date(b.date).getTime() : 0
      return dateB - dateA
    })
  }, [displaySessionPayments, marketplaceReceipts, pastFeePayments])

  const receiptItems = useMemo(() => pastPayments.slice(0, 5), [pastPayments])

  const billingStatusLabel = useMemo(() => {
    const normalized = String(billingInfo?.status || '').toLowerCase()
    if (!normalized) return 'No active plan'
    return normalized.replace(/_/g, ' ')
  }, [billingInfo])

  const billingTierLabel = useMemo(() => {
    const tier = String(billingInfo?.tier || '').trim()
    if (!tier) return 'Not set'
    return tier.charAt(0).toUpperCase() + tier.slice(1)
  }, [billingInfo])

  const handlePay = async (assignmentId: string) => {
    const assignmentWithFee = assignmentsWithFees.find((item) => item.assignment.id === assignmentId)
    if (needsGuardianApproval && assignmentWithFee?.fee?.org_id) {
      const approvalResult = await requestGuardianApproval({
        target_type: 'org',
        target_id: assignmentWithFee.fee.org_id,
        target_label: assignmentWithFee.fee.title || 'this organization',
        scope: 'transactions',
      })
      if (!approvalResult.ok) {
        setPaymentNotice(approvalResult.error || 'Unable to request guardian approval.')
        return
      }
      if (approvalResult.status !== 'approved') {
        setPaymentNotice(guardianPendingMessage)
        return
      }
    }
    setPayingId(assignmentId)
    setPaymentNotice('')
    const response = await fetch('/api/athlete/charges/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignment_id: assignmentId }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.clientSecret) {
      if (isGuardianApprovalApiError(payload)) {
        setPaymentNotice(payload?.error || guardianPendingMessage)
        setPayingId(null)
        return
      }
      setPaymentNotice(payload?.error || 'Unable to start payment.')
      setPayingId(null)
      return
    }
    const assignment = assignments.find((row) => row.id === assignmentId) || null
    setClientSecret(payload.clientSecret)
    setPayingAssignment(assignment)
    setPayingId(null)
  }

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!payingAssignment) return
    const response = await fetch('/api/athlete/charges/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignment_id: payingAssignment.id, payment_intent_id: paymentIntentId }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      if (isGuardianApprovalApiError(payload)) {
        setPaymentNotice(payload?.error || guardianPendingMessage)
        return
      }
      setPaymentNotice(payload?.error || 'Payment recorded but fee update failed.')
      return
    }
    setToast('Payment recorded')
    setClientSecret('')
    setPayingAssignment(null)
    const refresh = await fetch('/api/athlete/charges')
    if (refresh.ok) {
      const payload = await refresh.json()
      setAssignments((payload.assignments || []) as AssignmentRow[])
      setFees((payload.fees || []) as FeeRow[])
    }
    const summaryRefresh = await fetch('/api/athlete/payments-summary', { cache: 'no-store' })
    if (summaryRefresh.ok) {
      const payload = await summaryRefresh.json().catch(() => ({}))
      setSessionPayments((payload.session_payments || []) as SessionPaymentRow[])
      setMarketplaceReceipts((payload.marketplace_receipts || []) as MarketplaceReceiptRow[])
      setSavedPaymentMethods((payload.payment_methods || []) as PaymentMethodRow[])
      setBillingInfo((payload.billing || null) as BillingInfoRow | null)
    }
  }

  const handleOpenCustomerPortal = async () => {
    const response = await fetch('/api/stripe/customer-portal', { method: 'POST' })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.url) {
      setToast(data?.error || 'Unable to open billing portal.')
      return
    }
    window.open(data.url, '_blank', 'noopener,noreferrer')
  }

  const handleSubmitRefund = async () => {
    if (!refundPaymentId) return
    setRefundSubmitting(true)
    const response = await fetch(`/api/payments/sessions/${refundPaymentId}/refund-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: refundReason, note: refundNote }),
    })
    setRefundSubmitting(false)
    setRefundPaymentId(null)
    setRefundNote('')
    if (!response.ok) {
      setToast('Unable to submit refund request.')
      return
    }
    setToast('Refund request submitted. Support will follow up.')
  }

  const handleReceiptDownload = async (receiptId: string) => {
    setReceiptDownloading(receiptId)
    const params = new URLSearchParams()
    params.set('format', 'pdf')
    params.set('receipt', receiptId)
    const response = await fetch(`/api/athlete/exports?type=payments&${params.toString()}`)
    if (!response.ok) {
      setToast('Unable to download receipt.')
      setReceiptDownloading(null)
      return
    }
    const blob = await response.blob()
    const link = document.createElement('a')
    const objectUrl = window.URL.createObjectURL(blob)
    link.href = objectUrl
    link.download = `receipt-${receiptId}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(objectUrl)
    setReceiptDownloading(null)
  }

  const buildFeeLineItems = (fee: FeeRow) => {
    const title = fee.title.toLowerCase()
    if (title.includes('travel')) {
      return [
        { label: 'Transportation', amount: Math.round(fee.amount_cents * 0.5) },
        { label: 'Lodging', amount: Math.round(fee.amount_cents * 0.35) },
        { label: 'Meals', amount: Math.round(fee.amount_cents * 0.15) },
      ]
    }
    if (title.includes('uniform')) {
      return [
        { label: 'Jersey + shorts', amount: Math.round(fee.amount_cents * 0.7) },
        { label: 'Warmup gear', amount: Math.round(fee.amount_cents * 0.3) },
      ]
    }
    return [
      { label: 'Program dues', amount: Math.round(fee.amount_cents * 0.6) },
      { label: 'Facility + admin', amount: Math.round(fee.amount_cents * 0.4) },
    ]
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payments</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Team dues & fees</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Pay yearly dues and program fees in one place.</p>
          </div>
          <Link
            href="/athlete/settings#export-center"
            className="self-start rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
          >
            Go to export center
          </Link>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            {notice ? <p className="text-sm text-[#b80f0a]">{notice}</p> : null}
            {paymentNotice ? <p className="text-sm text-[#b80f0a]">{paymentNotice}</p> : null}
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {summaryStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{stat.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
                ))}
            </section>
            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Subscription</h2>
              <p className="mt-1 text-sm text-[#4a4a4a]">This reflects the live Stripe-backed billing state for your athlete plan.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-[#e5e5e5] bg-[#f5f5f5] p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Current plan</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{billingTierLabel}</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] bg-[#f5f5f5] p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Billing status</p>
                  <p className="mt-2 text-lg font-semibold capitalize text-[#191919]">{billingStatusLabel}</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] bg-[#f5f5f5] p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Period end</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {billingInfo?.current_period_end
                      ? new Date(billingInfo.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '—'}
                  </p>
                </div>
              </div>
            </section>
            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Payment methods</h2>
              <p className="mt-1 text-sm text-[#4a4a4a]">Manage your saved card details securely through Stripe.</p>
              <div className="mt-4">
                <div className="rounded-2xl border border-[#e5e5e5] bg-[#f5f5f5] p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Card on file</p>
                  <p className="mt-2 text-sm text-[#4a4a4a]">Your payment method is managed securely by Stripe.</p>
                  <button
                    type="button"
                    onClick={handleOpenCustomerPortal}
                    className="mt-3 rounded-full border border-[#191919] px-4 py-1.5 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    Manage card
                  </button>
                  <div className="mt-3 space-y-2">
                    {savedPaymentMethods.length === 0 ? (
                      <p className="text-xs text-[#4a4a4a]">No saved cards on file yet.</p>
                    ) : (
                      savedPaymentMethods.map((method) => (
                        <div key={method.id} className="rounded-2xl border border-[#e5e5e5] bg-white px-3 py-2 text-xs text-[#191919]">
                          {method.brand.toUpperCase()} ending in {method.last4}
                          {method.exp_month && method.exp_year ? ` · ${String(method.exp_month).padStart(2, '0')}/${method.exp_year}` : ''}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              {needsGuardianApproval && (
                <p className="mt-3 text-xs text-[#b80f0a]">Guardian approval required to make payments.</p>
              )}
            </section>
            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Upcoming payments</h2>
              <div className="mt-4 space-y-3 text-sm">
                {loading ? (
                  <LoadingState label="Loading fees..." />
                ) : upcomingAssignments.length === 0 ? (
                  <EmptyState title="No dues assigned." description="Any organization fees you owe will show up here." />
                ) : (
                  upcomingAssignments.map(({ assignment, fee }) => {
                    const statusInfo = getStatusCopy(assignment.status || 'unpaid')
                    const normalizedStatus = String(assignment.status || '').toLowerCase()
                    const needsPayment = normalizedStatus !== 'paid' && normalizedStatus !== 'waived'
                    const actionLabel = ['failed', 'past_due'].includes(normalizedStatus) ? 'Retry payment' : 'Pay now'
                    return (
                      <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <div>
                          <p className="font-semibold text-[#191919]">{fee.title}</p>
                          <p className="text-xs text-[#4a4a4a]">
                            {formatCurrency(fee.amount_cents)} · Due {fee.due_date || 'date not set'}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSelectedFeeDetail({ assignment, fee })}
                            className="mt-1 text-[11px] font-semibold text-[#b80f0a] underline"
                          >
                            View details
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#191919]">
                          <span className={`rounded-full border px-3 py-1 ${getStatusBadge(assignment.status || 'unpaid')}`}>
                            {statusInfo.label}
                          </span>
                          <span className="text-[11px] text-[#4a4a4a]">{statusInfo.note}</span>
                          {needsPayment && (
                            <button
                              type="button"
                              onClick={() => {
                                handlePay(assignment.id)
                              }}
                              disabled={payingId === assignment.id || !canTransact}
                              className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {payingId === assignment.id ? 'Processing...' : actionLabel}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Past payments</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Receipts and history for completed payments.</p>
                </div>
                <Link
                  href="/athlete/settings#export-center"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Go to export center
                </Link>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {loading ? (
                  <LoadingState label="Loading payments..." />
                ) : pastPayments.length === 0 ? (
                  <EmptyState title="No payment history yet." description="Paid sessions and dues will appear here." />
                ) : (
                  pastPayments.map((payment) => {
                    const statusLabel = String(payment.status || 'paid')
                    return (
                      <div key={`${payment.source}-${payment.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                        <div>
                          <p className="font-semibold text-[#191919]">{payment.title}</p>
                          <p className="text-xs text-[#4a4a4a]">
                            {payment.type} · {payment.date ? new Date(payment.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                            {'athleteName' in payment && payment.athleteName ? ` · ${payment.athleteName}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#191919]">
                          <span className={`rounded-full border px-3 py-1 ${getStatusBadge(statusLabel)}`}>
                            {statusLabel}
                          </span>
                          <span className="rounded-full border border-[#191919] px-3 py-1">
                            {formatCurrency(payment.amount)}
                          </span>
                          {payment.source === 'session' && (
                            payment.receiptUrl ? (
                              <a
                                href={payment.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                              >
                                Receipt
                              </a>
                            ) : (
                              <Link
                                href={`/athlete/payments/${payment.id}/receipt`}
                                target="_blank"
                                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                              >
                                View receipt
                              </Link>
                            )
                          )}
                          {payment.source === 'session' && payment.status === 'paid' && (
                            <button
                              type="button"
                              onClick={() => setRefundPaymentId(payment.id)}
                              className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919] transition-colors"
                            >
                              Request refund
                            </button>
                          )}
                          {payment.source === 'marketplace' && (
                            <Link
                              href="/athlete/marketplace/orders"
                              className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                            >
                              View order
                            </Link>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Receipts hub</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Quick access to recent receipts.</p>
                </div>
                <Link
                  href="/athlete/settings#export-center"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Go to export center
                </Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {receiptItems.map((receipt) => (
                  <div key={`receipt-${receipt.source}-${receipt.id}`} className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{receipt.type}</p>
                    <p className="mt-2 font-semibold text-[#191919]">{receipt.title}</p>
                    <p className="mt-1 text-xs text-[#4a4a4a]">
                      {receipt.date ? new Date(receipt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      {'athleteName' in receipt && receipt.athleteName ? ` · ${receipt.athleteName}` : ''}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs font-semibold">
                      <span className={`rounded-full border px-3 py-1 ${getStatusBadge(String(receipt.status || 'paid'))}`}>
                        {receipt.status || 'Paid'}
                      </span>
                      {receipt.source === 'marketplace' && receipt.receiptUrl ? (
                        <a
                          href={receipt.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#b80f0a] underline"
                        >
                          Receipt
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleReceiptDownload(receipt.id)}
                          className="text-[#b80f0a] underline"
                        >
                          {receiptDownloading === receipt.id ? 'Downloading...' : 'Download'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {receiptItems.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f9f9f9] p-4 text-xs text-[#4a4a4a]">
                    Receipts appear here once you’ve completed a payment.
                  </div>
                )}
              </div>
            </section>
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Need help with a charge?</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Support responds quickly to billing questions.</p>
                </div>
                <a
                  href="/athlete/support"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Contact support
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
      {selectedFeeDetail && (
        <div className="fixed inset-0 z-[305] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Fee details</p>
                <h2 className="mt-2 text-lg font-semibold text-[#191919]">{selectedFeeDetail.fee.title}</h2>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  Due {selectedFeeDetail.fee.due_date || 'date not set'} · {formatCurrency(selectedFeeDetail.fee.amount_cents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFeeDetail(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-[#f8f8f8] p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Line items</p>
              <div className="mt-3 space-y-2 text-sm">
                {buildFeeLineItems(selectedFeeDetail.fee).map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-[#4a4a4a]">{item.label}</span>
                    <span className="font-semibold text-[#191919]">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-[#e5e5e5] pt-2 text-sm font-semibold text-[#191919]">
                  <span>Total</span>
                  <span>{formatCurrency(selectedFeeDetail.fee.amount_cents)}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
              {(() => {
                const status = String(selectedFeeDetail.assignment.status || 'unpaid')
                const normalized = status.toLowerCase()
                if (normalized === 'paid' || normalized === 'waived') {
                  return (
                    <button
                      type="button"
                      onClick={() => handleReceiptDownload(selectedFeeDetail.assignment.id)}
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      {receiptDownloading === selectedFeeDetail.assignment.id ? 'Downloading...' : 'Download receipt'}
                    </button>
                  )
                }
                return (
                  <button
                    type="button"
                    onClick={() => handlePay(selectedFeeDetail.assignment.id)}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Pay now
                  </button>
                )
              })()}
              <a href="/athlete/support" className="text-[#b80f0a] underline">
                Get help with this fee
              </a>
            </div>
          </div>
        </div>
      )}
      {refundPaymentId && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Refund request</p>
                <h2 className="mt-2 text-lg font-semibold text-[#191919]">Request a refund</h2>
                <p className="mt-1 text-xs text-[#4a4a4a]">Our support team will review and follow up within 1–2 business days.</p>
              </div>
              <button
                type="button"
                onClick={() => setRefundPaymentId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-[#191919]">Reason</span>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="duplicate_charge">Duplicate charge</option>
                  <option value="session_canceled">Session was canceled</option>
                  <option value="service_not_provided">Service not provided</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-[#191919]">Additional details <span className="font-normal text-[#9a9a9a]">(optional)</span></span>
                <textarea
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  placeholder="Describe the issue..."
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSubmitRefund}
                disabled={refundSubmitting}
                className="rounded-full bg-[#b80f0a] px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {refundSubmitting ? 'Submitting...' : 'Submit request'}
              </button>
              <button
                type="button"
                onClick={() => setRefundPaymentId(null)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} onClose={() => setToast('')} />
      {clientSecret && stripePromise && payingAssignment && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payment</p>
                <h2 className="text-lg font-semibold text-[#191919]">Complete your fee</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setClientSecret('')
                  setPayingAssignment(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4">
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <StripeCheckoutForm clientSecret={clientSecret} onSuccess={handlePaymentSuccess} />
              </Elements>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
