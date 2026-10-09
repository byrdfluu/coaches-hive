'use client'

import { FormEvent, useEffect, useState } from 'react'
import LeagueNav from '@/components/LeagueNav'

const field = 'rounded-xl border border-[#dcdcdc] px-3 py-3'
const toggles = [
  ['join_requests', 'Join requests'], ['registrations', 'Registrations'], ['payments', 'Payments'], ['documents', 'Documents'],
  ['schedule_changes', 'Schedule changes'], ['game_results', 'Game results'], ['messages', 'Messages'], ['weekly_digest', 'Weekly digest'],
] as const

export default function LeagueSettingsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { fetch('/api/league/settings', { cache: 'no-store' }).then(async (response) => ({ response, payload: await response.json().catch(() => null) })).then(({ response, payload }) => { if (!response.ok) setNotice(payload?.error || 'Unable to load league settings.'); else setData(payload); setLoading(false) }).catch(() => { setNotice('Unable to load league settings.'); setLoading(false) }) }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setNotice('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const payload = {
      rules: { minimum_age: values.minimum_age || null, maximum_age: values.maximum_age || null, eligible_grades: String(values.eligible_grades || '').split(',').map((v) => v.trim()).filter(Boolean), registration_open: values.registration_open === 'on', approval_required: values.approval_required === 'on', waitlist_enabled: values.waitlist_enabled === 'on' },
      competition: { event_label: values.event_label, period_label: values.period_label, period_count: Number(values.period_count), period_minutes: Number(values.period_minutes), ties_allowed: values.ties_allowed === 'on', overtime_allowed: values.overtime_allowed === 'on', win_points: Number(values.win_points), tie_points: Number(values.tie_points), loss_points: Number(values.loss_points), tiebreakers: String(values.tiebreakers || '').split(',').map((v) => v.trim()).filter(Boolean), forfeit_home_score: Number(values.forfeit_home_score), forfeit_away_score: Number(values.forfeit_away_score) },
      notifications: Object.fromEntries(toggles.map(([key]) => [key, values[key] === 'on'])),
    }
    const response = await fetch('/api/league/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await response.json().catch(() => null); setNotice(response.ok ? 'League settings saved and synced.' : result?.error || 'Unable to save league settings.'); if (response.ok) setData((current: any) => ({ ...current, ...result })); setSaving(false)
  }
  const rules = data?.rules || {}, notifications = data?.notifications || {}, competition = data?.competition || {}
  return <main className="page-shell min-h-screen"><div className="relative z-10 mx-auto max-w-7xl px-5 py-10"><div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><LeagueNav/><div><p className="public-kicker">League Director Portal</p><h1 className="mt-2 text-3xl font-semibold">Operations settings</h1>{loading?<p className="mt-8">Loading settings…</p>:<form onSubmit={submit} className="mt-6 space-y-6">
    <section className="grid gap-3 rounded-2xl border border-[#dcdcdc] bg-white p-5 md:grid-cols-2"><h2 className="font-semibold md:col-span-2">Registration and eligibility</h2><label className="grid gap-1 text-sm">Minimum age<input className={field} name="minimum_age" type="number" min="0" max="100" defaultValue={rules.minimum_age ?? ''}/></label><label className="grid gap-1 text-sm">Maximum age<input className={field} name="maximum_age" type="number" min="0" max="100" defaultValue={rules.maximum_age ?? ''}/></label><label className="grid gap-1 text-sm md:col-span-2">Eligible grades, comma separated<input className={field} name="eligible_grades" defaultValue={(rules.eligible_grades || []).join(', ')}/></label>{[['registration_open','Registration open'],['approval_required','Approval required'],['waitlist_enabled','Enable waitlist']].map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input name={key} type="checkbox" defaultChecked={rules[key] ?? true}/>{label}</label>)}</section>
    <section className="grid gap-3 rounded-2xl border border-[#dcdcdc] bg-white p-5 md:grid-cols-2"><h2 className="font-semibold md:col-span-2">Competition format</h2><label className="grid gap-1 text-sm">Event label<input className={field} name="event_label" defaultValue={competition.event_label || 'Game'} required/></label><label className="grid gap-1 text-sm">Period label<input className={field} name="period_label" defaultValue={competition.period_label || 'Half'} required/></label>{[['period_count','Periods',2,1,12],['period_minutes','Minutes per period',45,1,180],['win_points','Win points',3,0,10],['tie_points','Tie points',1,0,10],['loss_points','Loss points',0,0,10],['forfeit_home_score','Forfeit winner score',3,0,100],['forfeit_away_score','Forfeit loser score',0,0,100]].map(([key,label,fallback,min,max])=><label key={String(key)} className="grid gap-1 text-sm">{label}<input className={field} name={String(key)} type="number" min={Number(min)} max={Number(max)} defaultValue={competition[String(key)] ?? fallback}/></label>)}<label className="grid gap-1 text-sm md:col-span-2">Tiebreakers, comma separated<input className={field} name="tiebreakers" defaultValue={(competition.tiebreakers || ['goal_difference','goals_for','head_to_head']).join(', ')}/></label><label className="flex items-center gap-2 text-sm"><input name="ties_allowed" type="checkbox" defaultChecked={competition.ties_allowed ?? true}/>Allow ties</label><label className="flex items-center gap-2 text-sm"><input name="overtime_allowed" type="checkbox" defaultChecked={competition.overtime_allowed ?? false}/>Allow overtime</label></section>
    <section className="grid gap-3 rounded-2xl border border-[#dcdcdc] bg-white p-5 md:grid-cols-2"><h2 className="font-semibold md:col-span-2">League notifications</h2>{toggles.map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input name={key} type="checkbox" defaultChecked={notifications[key] ?? true}/>{label}</label>)}</section>
    {notice?<p role="status" className="rounded-xl bg-white px-4 py-3 text-sm">{notice}</p>:null}<button disabled={saving || !data?.can_manage} className="rounded-full bg-[#191919] px-6 py-3 font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Save settings'}</button>
  </form>}</div></div></div></main>
}
