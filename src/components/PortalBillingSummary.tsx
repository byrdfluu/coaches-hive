'use client'

import { useEffect, useState } from 'react'

type Summary = { plan:string; billing:string; billing_interval:string|null; status:string; renewal:string; renewal_date:string|null; purchase_channel:string|null; sponsored_by:string|null; cancel_at_period_end?:boolean }
const formatDate = (value:string|null) => value ? new Date(value).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : 'No renewal required'

export default function PortalBillingSummary() {
  const [summary,setSummary]=useState<Summary|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{ fetch('/api/account/billing-summary',{cache:'no-store'}).then(async response=>{const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.error||'Unable to load billing.');setSummary(data)}).catch(err=>setError(err instanceof Error?err.message:'Unable to load billing.')) },[])
  return <section id="billing-summary" className="glass-card border border-[#191919] bg-white p-5">
    <h2 className="text-lg font-semibold text-[#191919]">Billing summary</h2>
    <p className="mt-1 text-sm text-[#4a4a4a]">Your current access and renewal details.</p>
    {error ? <p className="mt-4 text-sm text-[#b80f0a]">{error}</p> : !summary ? <p className="mt-4 text-sm text-[#4a4a4a]">Loading billing…</p> : <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[
        ['Plan',summary.plan],
        ['Billing',summary.billing],
        ...(summary.billing_interval ? [['Interval',summary.billing_interval]] : []),
        ['Status',summary.status.replaceAll('_',' ')],
        ['Renewal',summary.renewal_date ? `${summary.cancel_at_period_end?'Access ends':'Renews'} ${formatDate(summary.renewal_date)}` : summary.renewal],
        ...(summary.sponsored_by ? [['Access Through',summary.sponsored_by]] : []),
        ...(summary.purchase_channel ? [['Purchase channel',summary.purchase_channel==='apple_iap'?'Apple App Store':'Stripe']] : []),
      ].map(([label,value])=><div key={label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">{label}</dt><dd className="mt-1 text-sm font-semibold capitalize text-[#191919]">{value}</dd></div>)}
    </dl>}
  </section>
}
