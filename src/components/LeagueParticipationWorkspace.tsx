'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { leagueMessages, type LeagueLocale } from '@/lib/leagueI18n'

type Props = { portal: 'organization' | 'coach' | 'family'; athleteProfileId?: string | null }
type Payload = Record<string, any> & { competitions?: any[]; registrations?: any[]; fee_assignments?: any[]; games?: any[]; standings?: any[]; brackets?: any[]; documents?: any[]; document_statuses?: any[]; announcements?: any[]; authorized_teams?: any[] }
const money = (cents: unknown) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100)
const label = (value: unknown) => String(value || 'Not set').replaceAll('_', ' ')

export default function LeagueParticipationWorkspace({ portal, athleteProfileId }: Props) {
  const [locale, setLocale] = useState<LeagueLocale>('en')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const t = leagueMessages(locale)
  const endpoint = `/api/league/lifecycle${athleteProfileId ? `?athlete_profile_id=${encodeURIComponent(athleteProfileId)}` : ''}`
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const response = await fetch(endpoint, { cache: 'no-store' }).catch(() => null)
    const payload = response ? await response.json().catch(() => null) : null
    if (!response?.ok) setError(payload?.error || 'Unable to load league activity.')
    else setData(payload)
    setLoading(false)
  }, [endpoint])
  useEffect(() => { void load() }, [load])
  const registrations = data?.registrations || []
  const registrationByCompetition = useMemo(() => new Map(registrations.map((row: any) => [row.competition_id, row])), [registrations])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries())
    setSaving(true); setNotice('')
    const response = await fetch('/api/league/lifecycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit_registration', athlete_profile_id: athleteProfileId || null, ...values }) })
    const payload = await response.json().catch(() => ({})); setSaving(false)
    if (!response.ok) return setNotice(payload.error || 'Unable to submit registration.')
    setNotice('Registration submitted.'); form.reset(); await load()
  }
  const applyDiscount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries())
    setSaving(true); setNotice('')
    const response = await fetch('/api/league/lifecycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply_discount', athlete_profile_id: athleteProfileId || null, ...values }) })
    const payload = await response.json().catch(() => ({})); setSaving(false)
    if (!response.ok) return setNotice(payload.error || 'Unable to apply discount.')
    setNotice('Discount applied.'); form.reset(); await load()
  }
  const startCheckout = async (assignmentId: string) => {
    setSaving(true); setNotice('')
    const key = crypto.randomUUID()
    const response = await fetch('/api/mobile/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ type: 'league_fee', record_id: assignmentId, athlete_profile_id: athleteProfileId || null, idempotency_key: key }) })
    const payload = await response.json().catch(() => ({})); setSaving(false)
    if (!response.ok) return setNotice(typeof payload?.error === 'string' ? payload.error : payload?.error?.message || 'Unable to start secure checkout.')
    if (payload.checkout_url) window.location.assign(payload.checkout_url)
  }
  return <main className="page-shell min-h-screen"><div className="relative z-10 mx-auto max-w-7xl px-5 py-10">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="public-kicker">{portal === 'family' ? 'Parent & athlete portal' : portal === 'coach' ? 'Coach portal' : 'Organization portal'}</p><h1 className="mt-2 text-4xl font-semibold">{t.title}</h1><p className="mt-2 text-sm text-[#4a4a4a]">Competitions, eligibility, payments, documents, schedules, results, and league communication.</p></div><label className="text-sm font-semibold">Language <select value={locale} onChange={event => setLocale(event.target.value as LeagueLocale)} className="ml-2 rounded-lg border px-3 py-2"><option value="en">English</option><option value="es">Español</option></select></label></header>
    {notice ? <p role="status" className="mt-5 rounded-xl border bg-white px-4 py-3">{notice}</p> : null}
    {loading ? <p className="mt-8 rounded-2xl border bg-white p-5">{t.loading}</p> : error ? <div className="mt-8 rounded-2xl border border-[#b80f0a] bg-white p-5"><p>{error}</p><button onClick={() => void load()} className="mt-3 rounded-full bg-[#191919] px-4 py-2 text-white">{t.retry}</button></div> : !(data?.competitions || []).length && !registrations.length ? <p className="mt-8 rounded-2xl border bg-white p-5">{t.empty}</p> : null}
    {!loading && !error ? <div className="mt-8 grid gap-6 xl:grid-cols-2">
      {registrations.some((row:any)=>!row.participation_allowed)?<section className="rounded-3xl border border-amber-400 bg-amber-50 p-6 xl:col-span-2"><h2 className="font-semibold">Participation requirements remain</h2><div className="mt-3 grid gap-2 md:grid-cols-2">{registrations.filter((row:any)=>!row.participation_allowed).map((row:any)=><div key={row.id} className="rounded-xl bg-white p-3 text-sm"><strong>{row.athlete?.full_name||row.team?.name||'Registration'}</strong><ul className="mt-1 list-disc pl-5">{(row.missing_requirements||[]).map((item:string)=><li key={item}>{item}</li>)}</ul></div>)}</div></section>:null}
      <section className="rounded-3xl border bg-white p-6"><h2 className="text-xl font-semibold">{t.registration}</h2><div className="mt-4 space-y-4">{(data?.competitions || []).map((competition: any) => { const existing = registrationByCompetition.get(competition.id) as any; return <article key={competition.id} className="rounded-2xl bg-[#f7f6f4] p-4"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{competition.name}</h3><p className="text-sm capitalize text-[#666]">{label(competition.format)} · {competition.registration_modes.map(label).join(', ')}</p></div>{existing ? <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize">{label(existing.status)}</span> : null}</div>{!existing ? <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-2"><input type="hidden" name="competition_id" value={competition.id}/><select name="registration_type" required className="rounded-lg border px-3 py-2" defaultValue=""><option value="" disabled>{t.selectCompetition}</option>{competition.registration_modes.map((mode: string) => <option key={mode} value={mode}>{mode === 'free_agent' ? t.freeAgent : mode === 'team' ? t.team : t.individual}</option>)}</select>{portal !== 'family' ? <select name="team_id" required className="rounded-lg border px-3 py-2" defaultValue=""><option value="" disabled>{t.selectTeam}</option>{(data?.authorized_teams || []).map((team: any) => <option key={team.id} value={team.id}>{team.name}</option>)}</select> : null}<button disabled={saving} className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white">{t.register}</button></form> : <><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><p>{t.eligibility}: <strong className="capitalize">{label(existing.eligibility_status)}</strong></p><p>{t.payments}: <strong className="capitalize">{label(existing.payment_status)}</strong></p><p>Original: {money(existing.original_amount_cents)}</p><p>Discount: {money(existing.discount_amount_cents)}</p><p>{t.balance}: {money(Math.max(0, Number(existing.final_amount_cents || 0) - Number(existing.amount_paid_cents || 0)))}</p></div>{!['paid','not_required','waived'].includes(existing.payment_status) ? <form onSubmit={applyDiscount} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="registration_id" value={existing.id}/><input name="code" required placeholder={t.discount} className="min-w-56 flex-1 rounded-lg border px-3 py-2"/><button disabled={saving} className="rounded-full border border-[#191919] px-4 py-2 font-semibold">{t.apply}</button></form> : null}</>}</article>})}</div></section>
      <section className="rounded-3xl border bg-white p-6"><h2 className="text-xl font-semibold">{t.schedule}</h2><div className="mt-4 space-y-3">{(data?.games || []).map((game: any) => <article key={game.id} className="rounded-2xl bg-[#f7f6f4] p-4"><p className="font-semibold">{game.home_team?.name || 'Home'} vs {game.away_team?.name || 'Away'}</p><p className="mt-1 text-sm">{game.arrival_at ? `Arrival ${new Date(game.arrival_at).toLocaleString()} · ` : ''}Start {new Date(game.starts_at).toLocaleString()}</p><p className="text-sm text-[#666]">{game.venue?.name || game.location || 'Venue pending'}{game.field?.name ? ` · ${game.field.name}` : ''}</p>{game.venue?.parking_instructions ? <p className="mt-2 text-xs">Parking: {game.venue.parking_instructions}</p> : null}{game.venue?.entrance_instructions ? <p className="text-xs">Entrance: {game.venue.entrance_instructions}</p> : null}</article>)}{!(data?.games || []).length ? <p className="text-sm text-[#666]">No games scheduled.</p> : null}</div></section>
      <section className="rounded-3xl border bg-white p-6"><h2 className="text-xl font-semibold">{t.documents}</h2><div className="mt-4 space-y-3">{(data?.documents || []).map((document: any) => { const status = (data?.document_statuses || []).find((row: any) => row.document_id === document.id); return <article key={document.id} className="rounded-2xl bg-[#f7f6f4] p-4"><p className="font-semibold">{document.title}</p><p className="text-sm capitalize">{label(status?.status || (document.is_required ? 'missing' : 'optional'))}</p></article>})}</div></section>
      <section className="rounded-3xl border bg-white p-6"><h2 className="text-xl font-semibold">{t.payments}</h2><div className="mt-4 space-y-3">{(data?.fee_assignments || []).map((assignment: any) => {const due=Math.max(0,Number(assignment.amount_cents||0)-Number(assignment.paid_cents||0)-Number(assignment.refunded_cents||0));return <article key={assignment.id} className="rounded-2xl bg-[#f7f6f4] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{t.balance}: {money(due)}</p><p className="text-sm capitalize">{label(assignment.status)}{assignment.due_at?` · Due ${new Date(assignment.due_at).toLocaleDateString()}`:''}</p>{Number(assignment.refunded_cents||0)>0?<p className="text-xs">Refunded: {money(assignment.refunded_cents)}</p>:null}</div>{due>0&&['unpaid','partial'].includes(assignment.status)?<button type="button" disabled={saving} onClick={()=>void startCheckout(assignment.id)} className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Checkout</button>:null}{assignment.receipt_url?<a href={assignment.receipt_url} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">Receipt</a>:null}</div></article>})}{!(data?.fee_assignments||[]).length?<p className="text-sm text-[#666]">No league charges.</p>:null}</div></section>
      <section className="rounded-3xl border bg-white p-6"><h2 className="text-xl font-semibold">{t.standings}</h2>{(data?.standings || []).flatMap((group: any) => group.rows || []).map((row: any) => <div key={`${row.team_id}-${row.division_id || ''}`} className="mt-3 flex justify-between rounded-xl bg-[#f7f6f4] p-3 text-sm"><strong>{row.team_name}</strong><span>{row.wins}-{row.losses}-{row.ties} · {row.standing_points} pts</span></div>)}{(data?.brackets || []).map((entry: any) => <p key={entry.id} className="mt-2 rounded-xl border px-3 py-2 text-sm">Round {entry.round_number}, slot {entry.slot_number}</p>)}</section>
      <section className="rounded-3xl border bg-white p-6 xl:col-span-2"><h2 className="text-xl font-semibold">{t.messages}</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{(data?.announcements || []).map((item: any) => <article key={item.id} className="rounded-2xl bg-[#f7f6f4] p-4"><p className="font-semibold">{item.title}</p><p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p><p className="mt-2 text-xs text-[#666]">{new Date(item.published_at).toLocaleString()}</p></article>)}</div></section>
    </div> : null}
  </div></main>
}
