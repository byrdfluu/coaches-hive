'use client'

import { useEffect, useState } from 'react'

export default function AthleteDiscoverySettings() {
  const [form, setForm] = useState({ city: '', state: '', zip_code: '' })
  const [message, setMessage] = useState('')
  useEffect(() => { fetch('/api/athlete/discovery-profile').then(r => r.json()).then(d => d.profile && setForm({ city:d.profile.city||'', state:d.profile.state||'', zip_code:d.profile.zip_code||'' })).catch(() => setMessage('Unable to load location.')) }, [])
  const save = async () => { setMessage('Saving…'); const response = await fetch('/api/athlete/discovery-profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}); const data=await response.json().catch(()=>null); setMessage(response.ok?'Location saved.':data?.error||'Unable to save location.') }
  return <section className="glass-card border border-[#191919] bg-white p-5">
    <h2 className="text-lg font-semibold text-[#191919]">Discovery location</h2>
    <p className="mt-1 text-sm text-[#4a4a4a]">Private location details help rank nearby coaches and organizations. They are not displayed publicly.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_100px_140px_auto]">
      <input aria-label="City" placeholder="City" value={form.city} onChange={e=>setForm({...form,city:e.target.value})} className="rounded-2xl border border-[#dcdcdc] px-3 py-2" />
      <input aria-label="State" placeholder="State" maxLength={2} value={form.state} onChange={e=>setForm({...form,state:e.target.value})} className="rounded-2xl border border-[#dcdcdc] px-3 py-2 uppercase" />
      <input aria-label="ZIP code" placeholder="ZIP code" value={form.zip_code} onChange={e=>setForm({...form,zip_code:e.target.value})} className="rounded-2xl border border-[#dcdcdc] px-3 py-2" />
      <button type="button" onClick={save} className="rounded-full bg-[#191919] px-5 py-2 text-sm font-semibold text-white">Save</button>
    </div>{message && <p className="mt-2 text-sm text-[#4a4a4a]">{message}</p>}
  </section>
}
