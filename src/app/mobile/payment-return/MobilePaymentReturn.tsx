'use client'

import { useEffect, useMemo, useState } from 'react'

type Props={status:string;type:string;recordId:string;appStoreUrl:string|null}

export default function MobilePaymentReturn({status,type,recordId,appStoreUrl}:Props){
  const [openFailed,setOpenFailed]=useState(false)
  const canceled=status==='canceled'
  const deepLink=useMemo(()=>{
    if(status==='billing_updated')return 'coacheshive://billing-updated'
    const params=new URLSearchParams({type:type||'payment',status:canceled?'canceled':'processing'})
    if(recordId)params.set('id',recordId)
    return `coacheshive://payment-complete?${params.toString()}`
  },[canceled,recordId,status,type])
  const openApp=()=>{
    setOpenFailed(false)
    window.location.assign(deepLink)
    window.setTimeout(()=>{if(document.visibilityState==='visible')setOpenFailed(true)},1400)
  }
  useEffect(()=>{const timer=window.setTimeout(openApp,250);return()=>window.clearTimeout(timer)},[deepLink])
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-5 text-[#191919]">
    <section className="w-full max-w-lg rounded-3xl border border-[#dedede] bg-white p-8 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Coaches Hive</p>
      <h1 className="mt-4 text-3xl font-semibold">{canceled?'Checkout canceled':'Payment received'}</h1>
      <p className="mt-4 text-sm leading-6 text-[#555]">{canceled
        ?'No new purchase will be activated. Return to Coaches Hive when you are ready.'
        :'Your payment is being securely confirmed. Return to Coaches Hive to refresh the purchase status.'}</p>
      <button type="button" onClick={openApp} className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-[#b80f0a] px-8 py-3 font-bold text-white">Open Coaches Hive</button>
      {openFailed?<div className="mt-4 text-sm text-[#666]" role="status">
        <p>Coaches Hive did not open automatically.</p>
        {appStoreUrl?<a className="mt-3 inline-block font-semibold text-[#b80f0a] underline" href={appStoreUrl}>Download Coaches Hive</a>:null}
      </div>:null}
    </section>
  </main>
}
