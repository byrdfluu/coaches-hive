'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type ReceiptData = {
  id: string
  amount: number
  currency: string
  status: string
  paid_at: string | null
  created_at: string
  athleteName: string
  athleteEmail: string
  coachName: string
  sessionTitle: string | null
}

export default function PaymentReceiptPage() {
  const supabase = createClientComponentClient()
  const params = useParams()
  const id = String(params.id || '')
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const athleteId = userData.user?.id
      if (!athleteId) { setError('Not authenticated.'); setLoading(false); return }

      const { data: payment } = await supabase
        .from('session_payments')
        .select('id, amount, currency, status, paid_at, created_at, coach_id, session_id, athlete_id')
        .eq('id', id)
        .eq('athlete_id', athleteId)
        .maybeSingle()
      const paymentRow = (payment || null) as {
        id: string
        amount?: number | string | null
        currency?: string | null
        status?: string | null
        paid_at?: string | null
        created_at?: string | null
        coach_id?: string | null
        session_id?: string | null
        athlete_id?: string | null
      } | null

      if (!active) return
      if (!paymentRow) { setError('Receipt not found or you do not have access.'); setLoading(false); return }

      const [athleteRes, coachRes, sessionRes] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', athleteId).maybeSingle(),
        paymentRow.coach_id
          ? supabase.from('profiles').select('full_name').eq('id', paymentRow.coach_id).maybeSingle()
          : Promise.resolve({ data: null }),
        paymentRow.session_id
          ? supabase.from('sessions').select('title').eq('id', paymentRow.session_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      const athleteProfile = (athleteRes.data || null) as { full_name?: string | null; email?: string | null } | null
      const coachProfile = (coachRes.data || null) as { full_name?: string | null } | null
      const sessionRow = (sessionRes as { data?: { title?: string | null } | null } | null)?.data || null

      if (!active) return
      setReceipt({
        id: paymentRow.id,
        amount: Number(paymentRow.amount || 0),
        currency: paymentRow.currency || 'usd',
        status: paymentRow.status || 'paid',
        paid_at: paymentRow.paid_at || null,
        created_at: paymentRow.created_at || '',
        athleteName: athleteProfile?.full_name || 'Athlete',
        athleteEmail: athleteProfile?.email || '',
        coachName: coachProfile?.full_name || 'Coach',
        sessionTitle: sessionRow?.title || null,
      })
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [id, supabase])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-[#4a4a4a]">Loading receipt…</p>
      </main>
    )
  }

  if (error || !receipt) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="text-center">
          <p className="text-sm text-[#b80f0a]">{error || 'Receipt not found.'}</p>
          <Link href="/athlete/payments" className="mt-4 block text-sm font-semibold text-[#191919] underline">
            Back to payments
          </Link>
        </div>
      </main>
    )
  }

  const formattedAmount = `$${receipt.amount.toFixed(2).replace(/\.00$/, '')}`
  const date = receipt.paid_at || receipt.created_at
  const formattedDate = date ? new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'

  return (
    <main className="min-h-screen bg-white px-6 py-10 print:py-4">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between print:hidden">
          <Link href="/athlete/payments" className="text-sm font-semibold text-[#191919] underline">
            ← Back to payments
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-white transition-colors"
          >
            Print / Save PDF
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-[#dcdcdc] p-8 print:border-none print:mt-0 print:p-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payment receipt</p>
              <h1 className="mt-2 text-2xl font-semibold text-[#191919]">{formattedAmount}</h1>
              <p className="mt-1 text-sm text-[#4a4a4a]">{formattedDate}</p>
            </div>
            <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] capitalize">
              {receipt.status}
            </span>
          </div>

          <hr className="my-6 border-[#dcdcdc]" />

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#4a4a4a]">Receipt ID</span>
              <span className="font-mono text-xs text-[#191919]">{receipt.id.slice(0, 8).toUpperCase()}</span>
            </div>
            {receipt.sessionTitle && (
              <div className="flex justify-between">
                <span className="text-[#4a4a4a]">Session</span>
                <span className="font-semibold text-[#191919]">{receipt.sessionTitle}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#4a4a4a]">Coach</span>
              <span className="font-semibold text-[#191919]">{receipt.coachName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4a4a4a]">Athlete</span>
              <span className="font-semibold text-[#191919]">{receipt.athleteName}</span>
            </div>
            {receipt.athleteEmail && (
              <div className="flex justify-between">
                <span className="text-[#4a4a4a]">Email</span>
                <span className="text-[#191919]">{receipt.athleteEmail}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#4a4a4a]">Currency</span>
              <span className="text-[#191919] uppercase">{receipt.currency}</span>
            </div>
          </div>

          <hr className="my-6 border-[#dcdcdc]" />

          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-[#191919]">Total paid</span>
            <span className="text-xl font-semibold text-[#191919]">{formattedAmount}</span>
          </div>

          <p className="mt-6 text-xs text-[#4a4a4a] print:mt-4">
            This receipt was generated by Coaches Hive. For billing questions, contact your coach or{' '}
            <a href="mailto:support@coacheshive.com" className="underline">support@coacheshive.com</a>.
          </p>
        </div>
      </div>
    </main>
  )
}
